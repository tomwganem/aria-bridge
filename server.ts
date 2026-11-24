import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {
  ARIA_PACKET_SIZE,
  buildAriaAckFrame,
  buildGoogleFitDatasetPayloads,
  buildHealthConnectRecord,
  decodeAriaPacket,
  encodeAriaPacket,
  hexToBytes,
} from './src/shared/ariaProtocol.ts';
import { bridgeStore } from './server/store.ts';

const PORT = Number(process.env.PORT) || 3000;

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

async function startServer() {
  const app = express();

  // Hardware Endpoint: Original Fitbit Aria Gen 1 HTTP POST /scale/upload
  // Accepts raw 62-byte little-endian binary payloads and returns a valid 16-byte ACK frame.
  app.post(
    '/scale/upload',
    express.raw({ type: '*/*', limit: '512b' }),
    (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length < ARIA_PACKET_SIZE) {
          return res.status(400).json({
            error: `Expected raw Fitbit Aria binary frame of at least ${ARIA_PACKET_SIZE} bytes.`,
          });
        }

        const originHeader = req.headers['x-ariabridge-origin'];
        const origin =
          originHeader === 'bench_injector'
            ? 'bench_injector'
            : originHeader === 'hex_import'
              ? 'hex_import'
              : 'scale_http';

        const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
        const { packet, weighIn } = bridgeStore.ingestBinaryPacket(
          bytes,
          getClientIp(req),
          origin
        );

        const ackFrame = buildAriaAckFrame(Math.floor(Date.now() / 1000));
        res.status(200);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-AriaBridge-Packet-Id', packet.id);
        res.setHeader('X-AriaBridge-WeighIn-Id', weighIn.id);
        res.setHeader('X-AriaBridge-Client-Record-Id', weighIn.clientRecordId);
        return res.send(Buffer.from(ackFrame));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse binary frame.';
        return res.status(400).json({ error: message });
      }
    }
  );

  app.use(express.json({ limit: '1mb' }));

  // Full console state hydration
  app.get('/api/state', (_req, res) => {
    res.json(bridgeStore.getPublicState());
  });

  // Decode raw hex dump (optionally persisting into store)
  app.post('/api/packets/decode-hex', (req, res) => {
    try {
      const { hex, persist } = req.body as { hex?: string; persist?: boolean };
      if (typeof hex !== 'string' || hex.trim().length === 0) {
        return res.status(400).json({ error: 'Hex payload string is required.' });
      }

      const bytes = hexToBytes(hex);
      if (bytes.length > 512) {
        return res.status(400).json({ error: 'Hex payload exceeds maximum 512-byte Aria frame limit.' });
      }
      const decoded = decodeAriaPacket(bytes);

      if (persist) {
        const result = bridgeStore.ingestBinaryPacket(bytes, getClientIp(req), 'hex_import');
        return res.status(201).json({
          persisted: true,
          decoded,
          packet: result.packet,
          weighIn: result.weighIn,
        });
      }

      return res.json({
        persisted: false,
        byteLength: bytes.length,
        decoded,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid hex frame.';
      return res.status(400).json({ error: message });
    }
  });

  // Encode structured test packet (helper for preview or bench injection)
  app.post('/api/packets/craft', (req, res) => {
    try {
      const input = req.body;
      const nowSec = Math.floor(Date.now() / 1000);
      const bytes = encodeAriaPacket({
        batteryPercent: Number(input.batteryPercent ?? 85),
        macAddress: String(input.macAddress ?? '00:1D:C9:A4:2B:11'),
        firmwareVersion: Number(input.firmwareVersion ?? 28),
        syncTimestamp: Number(input.syncTimestamp ?? nowSec),
        measurementTimestamp: Number(input.measurementTimestamp ?? nowSec),
        impedanceOhms: Number(input.impedanceOhms ?? 470),
        weightGrams: Number(input.weightGrams ?? 74200),
        userSlot: Number(input.userSlot ?? 1),
        bodyFatPercent: Number(input.bodyFatPercent ?? 18.2),
        variance: Number(input.variance ?? 0.036),
      });

      const result = bridgeStore.ingestBinaryPacket(bytes, getClientIp(req), 'bench_injector');
      return res.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to craft test packet.';
      return res.status(400).json({ error: message });
    }
  });

  // Weigh-in management
  app.delete('/api/weigh-ins/:id', (req, res) => {
    const removed = bridgeStore.deleteWeighIn(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Weigh-in record not found.' });
    }
    return res.json({ ok: true, id: req.params.id });
  });

  app.patch('/api/weigh-ins/:id', (req, res) => {
    const { syncStatus, userSlot } = req.body as {
      syncStatus?: 'queued' | 'synced_hc' | 'synced_gfit' | 'failed';
      userSlot?: number;
    };
    const allowedStatuses = new Set(['queued', 'synced_hc', 'synced_gfit', 'failed']);
    if (syncStatus && !allowedStatuses.has(syncStatus)) {
      return res.status(400).json({ error: 'Invalid syncStatus value.' });
    }
    const updated = bridgeStore.updateWeighInStatus(req.params.id, {
      syncStatus,
      userSlot: typeof userSlot === 'number' ? userSlot : undefined,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Weigh-in record not found.' });
    }
    return res.json({ weighIn: updated });
  });

  // Household profile mapping CRUD
  app.put('/api/profiles/:slot', (req, res) => {
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 8) {
      return res.status(400).json({ error: 'Aria user slot must be an integer between 0 and 8.' });
    }
    const { name, heightCm, minWeightKg, maxWeightKg, preferredUnit, autoQueueHealthConnect } = req.body;
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 48) : '';
    if (!cleanName) {
      return res.status(400).json({ error: 'Profile name is required.' });
    }

    const profiles = bridgeStore.upsertProfile({
      slot,
      name: cleanName,
      heightCm: Math.max(0, Math.min(250, Number(heightCm) || 0)),
      minWeightKg: Math.max(0, Math.min(350, Number(minWeightKg) || 0)),
      maxWeightKg: Math.max(0, Math.min(350, Number(maxWeightKg) || 200)),
      preferredUnit: preferredUnit === 'lb' ? 'lb' : 'kg',
      autoQueueHealthConnect: Boolean(autoQueueHealthConnect),
    });

    return res.json({ profiles });
  });

  app.delete('/api/profiles/:slot', (req, res) => {
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 8) {
      return res.status(400).json({ error: 'Only custom profile slots 1–8 can be deleted.' });
    }
    const profiles = bridgeStore.deleteProfile(slot);
    return res.json({ profiles });
  });

  // Bridge configuration update
  app.put('/api/config', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.lanBridgeIp === 'string') patch.lanBridgeIp = body.lanBridgeIp.trim().slice(0, 64);
    if (typeof body.lanRelayPort === 'number' && body.lanRelayPort >= 1 && body.lanRelayPort <= 65535) {
      patch.lanRelayPort = Math.round(body.lanRelayPort);
    }
    if (typeof body.bridgePublicUrl === 'string') {
      patch.bridgePublicUrl = body.bridgePublicUrl.trim().replace(/\/$/, '').slice(0, 200);
    }
    if (typeof body.enableProxyReplay === 'boolean') patch.enableProxyReplay = body.enableProxyReplay;
    if (typeof body.fitbitUpstreamIp === 'string') patch.fitbitUpstreamIp = body.fitbitUpstreamIp.trim().slice(0, 64);
    if (body.displayUnit === 'kg' || body.displayUnit === 'lb') patch.displayUnit = body.displayUnit;

    const config = bridgeStore.updateConfig(patch);
    return res.json({ config });
  });

  // =========================================================================
  // Android Health Connect Pull-Queue API (Bearer Token Authenticated)
  // =========================================================================
  app.get('/api/health-connect/pending', (req, res) => {
    const token = extractBearerToken(req);
    if (!token || !bridgeStore.verifyPairingToken(token)) {
      return res.status(401).json({
        error: 'Unauthorized. Provide a valid Authorization: Bearer <pairing_token> header.',
      });
    }

    const deviceLabel =
      typeof req.headers['x-device-name'] === 'string' && req.headers['x-device-name'].trim()
        ? req.headers['x-device-name'].trim().slice(0, 64)
        : 'Android Health Connect Client';

    const pending = bridgeStore.getPendingHealthConnectWeighIns();
    const records = pending.map((w) => buildHealthConnectRecord(w));
    bridgeStore.recordHealthConnectPull(deviceLabel, records.length);

    return res.json({
      bridge: 'AriaBridge Lab',
      protocolVersion: 1,
      serverTime: new Date().toISOString(),
      pendingCount: records.length,
      records,
    });
  });

  app.post('/api/health-connect/ack', (req, res) => {
    const token = extractBearerToken(req);
    if (!token || !bridgeStore.verifyPairingToken(token)) {
      return res.status(401).json({
        error: 'Unauthorized. Provide a valid Authorization: Bearer <pairing_token> header.',
      });
    }

    const { clientRecordIds, deviceLabel } = req.body as {
      clientRecordIds?: unknown;
      deviceLabel?: unknown;
    };

    if (!Array.isArray(clientRecordIds) || !clientRecordIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'clientRecordIds must be an array of strings.' });
    }

    const safeDevice =
      typeof deviceLabel === 'string' && deviceLabel.trim()
        ? deviceLabel.trim().slice(0, 64)
        : 'Android Health Connect Client';

    const result = bridgeStore.acknowledgeHealthConnect(clientRecordIds, safeDevice);
    return res.json({
      ok: true,
      ...result,
    });
  });

  // Console-triggered roundtrip handshake simulator (verifies real pending -> ack flow)
  app.post('/api/health-connect/simulate', (req, res) => {
    const deviceLabel =
      typeof req.body?.deviceLabel === 'string' && req.body.deviceLabel.trim()
        ? req.body.deviceLabel.trim().slice(0, 64)
        : 'Android Companion Simulator';

    const pending = bridgeStore.getPendingHealthConnectWeighIns();
    const records = pending.map((w) => buildHealthConnectRecord(w));
    bridgeStore.recordHealthConnectPull(deviceLabel, records.length);

    if (records.length === 0) {
      return res.json({
        ok: true,
        pulledCount: 0,
        acknowledgedCount: 0,
        message: 'Queue is already empty. Inject a test packet to test a fresh Health Connect sync.',
      });
    }

    const ackResult = bridgeStore.acknowledgeHealthConnect(
      records.map((r) => r.clientRecordId),
      deviceLabel
    );

    return res.json({
      ok: true,
      pulledCount: records.length,
      acknowledgedCount: ackResult.acknowledgedCount,
      records,
      message: `Pulled ${records.length} record(s) and acknowledged HealthConnectClient.insertRecords().`,
    });
  });

  app.post('/api/health-connect/rotate-token', (_req, res) => {
    const rotated = bridgeStore.rotatePairingToken();
    return res.json({ ok: true, ...rotated });
  });

  // =========================================================================
  // Optional Legacy Google Fit REST API Proxy (Server-Side .env Token Only)
  // =========================================================================
  app.post('/api/sync/google-fit', async (req, res) => {
    const { weighInIds } = req.body as { weighInIds?: string[] };
    const targets = bridgeStore.getWeighInsByIds(
      Array.isArray(weighInIds) && weighInIds.length > 0 ? weighInIds : undefined
    );

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No matching weigh-in records selected.' });
    }

    const accessToken = process.env.GOOGLE_FIT_ACCESS_TOKEN?.trim();
    const previews = targets.map((w) => ({
      weighInId: w.id,
      timestamp: w.timestamp,
      payload: buildGoogleFitDatasetPayloads(w),
    }));

    if (!accessToken) {
      bridgeStore.addSyncLog({
        channel: 'google_fit_rest',
        status: 'dry_run',
        deviceLabel: 'Google Fit REST Proxy',
        recordCount: targets.length,
        detail:
          'Dry-run verified nanosecond com.google.weight and com.google.body.fat.percentage PATCH payloads (GOOGLE_FIT_ACCESS_TOKEN not configured in server .env).',
      });

      return res.json({
        mode: 'dry_run',
        syncedCount: 0,
        message:
          'GOOGLE_FIT_ACCESS_TOKEN is not set in server environment. Validated nanosecond PATCH payloads in dry-run mode.',
        previews,
      });
    }

    // Real Google Fit REST API PATCH calls to hardcoded googleapis.com fitness endpoints
    const results: Array<{ weighInId: string; status: number; ok: boolean; error?: string }> = [];
    let syncedCount = 0;

    for (const item of previews) {
      try {
        const weightResp = await fetch(item.payload.weightEndpoint, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json;encoding=utf-8',
          },
          body: JSON.stringify(item.payload.weightBody),
        });

        let ok = weightResp.ok;
        let errorText: string | undefined;

        if (!ok) {
          errorText = `Weight PATCH HTTP ${weightResp.status}`;
        } else if (item.payload.bodyFatEndpoint && item.payload.bodyFatBody) {
          const bfResp = await fetch(item.payload.bodyFatEndpoint, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json;encoding=utf-8',
            },
            body: JSON.stringify(item.payload.bodyFatBody),
          });
          if (!bfResp.ok) {
            ok = false;
            errorText = `BodyFat PATCH HTTP ${bfResp.status}`;
          }
        }

        if (ok) {
          syncedCount++;
          bridgeStore.updateWeighInStatus(item.weighInId, {
            syncStatus: 'synced_gfit',
            syncedDevice: 'Google Fit REST API',
          });
        } else {
          bridgeStore.updateWeighInStatus(item.weighInId, {
            syncStatus: 'failed',
            lastError: errorText ?? 'Google Fit API error',
          });
        }

        results.push({ weighInId: item.weighInId, status: weightResp.status, ok, error: errorText });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        bridgeStore.updateWeighInStatus(item.weighInId, {
          syncStatus: 'failed',
          lastError: msg,
        });
        results.push({ weighInId: item.weighInId, status: 0, ok: false, error: msg });
      }
    }

    bridgeStore.addSyncLog({
      channel: 'google_fit_rest',
      status: syncedCount === targets.length ? 'ok' : 'error',
      deviceLabel: 'Google Fit REST API',
      recordCount: syncedCount,
      detail: `Dispatched ${targets.length} record(s) to googleapis.com/fitness/v1 (${syncedCount} succeeded).`,
    });

    return res.json({
      mode: 'live',
      syncedCount,
      results,
      previews,
    });
  });

  // =========================================================================
  // CSV & Health Connect JSON Exports
  // =========================================================================
  app.get('/api/export/csv', (_req, res) => {
    const state = bridgeStore.getPublicState();
    const header = [
      'Timestamp_ISO',
      'ClientRecordId',
      'Profile',
      'UserSlot',
      'Weight_kg',
      'Weight_lb',
      'BodyFat_pct',
      'LeanMass_kg',
      'Impedance_ohm',
      'BMI',
      'Battery_pct',
      'SyncStatus',
      'ScaleMAC',
    ].join(',');

    const rows = state.weighIns.map((w) =>
      [
        w.timestamp,
        w.clientRecordId,
        w.profileName,
        w.userSlot,
        w.weightKg.toFixed(2),
        w.weightLb.toFixed(2),
        w.bodyFatPercent.toFixed(1),
        w.leanMassKg.toFixed(2),
        w.impedanceOhms,
        w.bmi !== null ? w.bmi.toFixed(1) : '',
        w.batteryPercent,
        w.syncStatus,
        w.macAddress,
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    bridgeStore.addSyncLog({
      channel: 'csv_export',
      status: 'ok',
      deviceLabel: 'Browser Download',
      recordCount: state.weighIns.length,
      detail: `Exported ${state.weighIns.length} weigh-in record(s) to CSV.`,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ariabridge-weigh-ins.csv"');
    return res.send([header, ...rows].join('\n'));
  });

  app.get('/api/export/health-connect-json', (_req, res) => {
    const state = bridgeStore.getPublicState();
    const records = state.weighIns.map((w) => buildHealthConnectRecord(w));

    bridgeStore.addSyncLog({
      channel: 'json_export',
      status: 'ok',
      deviceLabel: 'Browser Download',
      recordCount: records.length,
      detail: `Exported ${records.length} canonical Health Connect WeightRecord/BodyFatRecord bundle entries.`,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ariabridge-health-connect.json"');
    return res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          source: 'AriaBridge Lab (Fitbit Aria Gen 1)',
          recordCount: records.length,
          records,
        },
        null,
        2
      )
    );
  });

  // Mount Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AriaBridge Lab running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AriaBridge Lab server:', err);
  process.exit(1);
});
