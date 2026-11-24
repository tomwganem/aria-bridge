import { BridgeConfig } from '../shared/ariaProtocol';

export function generateDnsmasqConfig(config: BridgeConfig): string {
  const ip = config.lanBridgeIp || '192.168.1.50';
  return `# Pi-hole / dnsmasq local DNS override for Fitbit Aria (Gen 1)
# Save to /etc/dnsmasq.d/09-aria-bridge.conf (or add Local DNS Record in Pi-hole UI)
# Redirects the scale's hardcoded upload hostname to your local LAN relay host.

address=/www.fitbit.com/${ip}
address=/scale.fitbit.com/${ip}

# Optional: Limit override strictly to the Aria scale MAC address using dnsmasq tags
# dhcp-host=${config.scaleMacAddress},set:aria_scale
`;
}

export function generateLanRelayScript(config: BridgeConfig): string {
  const targetUrl = `${(config.bridgePublicUrl || 'http://192.168.1.50:3000').replace(/\/$/, '')}/scale/upload`;
  const port = config.lanRelayPort || 80;
  const replayEnabled = config.enableProxyReplay;
  const upstreamIp = config.fitbitUpstreamIp || '104.16.100.29';

  return `#!/usr/bin/env node
/**
 * AriaBridge Lab — Standalone Port-${port} LAN Relay for Fitbit Aria (Gen 1)
 *
 * Run on a Raspberry Pi, Linux box, or Mac on the same Wi-Fi LAN as your scale:
 *   sudo node aria-lan-relay.mjs
 *
 * Listens on HTTP port ${port} for POST /scale/upload from the Aria scale,
 * forwards the raw 62-byte little-endian binary payload to AriaBridge Lab,
 * and returns the valid binary ACK frame so the scale displays a checkmark.
 */
import http from 'node:http';

const LISTEN_PORT = ${port};
const BRIDGE_UPLOAD_URL = ${JSON.stringify(targetUrl)};
const ENABLE_PROXY_REPLAY = ${replayEnabled ? 'true' : 'false'};
const UPSTREAM_FITBIT_IP = ${JSON.stringify(upstreamIp)};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/scale/upload')) {
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes <= 1024) chunks.push(chunk);
    });

    req.on('end', async () => {
      const payload = Buffer.concat(chunks);
      console.log(\`[AriaRelay] Captured \${payload.length} bytes from \${req.socket.remoteAddress}\`);

      try {
        const bridgeResp = await fetch(BRIDGE_UPLOAD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-AriaBridge-Origin': 'scale_http',
          },
          body: payload,
        });

        const ackBuffer = Buffer.from(await bridgeResp.arrayBuffer());

        if (ENABLE_PROXY_REPLAY) {
          fetch(\`http://\${UPSTREAM_FITBIT_IP}/scale/upload\`, {
            method: 'POST',
            headers: {
              Host: 'www.fitbit.com',
              'Content-Type': 'application/octet-stream',
            },
            body: payload,
          }).catch((err) => console.warn('[AriaRelay] Upstream replay warning:', err.message));
        }

        res.writeHead(bridgeResp.status, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': ackBuffer.length,
        });
        res.end(ackBuffer);
        console.log(\`[AriaRelay] Forwarded to bridge & returned \${ackBuffer.length}-byte ACK.\`);
      } catch (err) {
        console.error('[AriaRelay] Bridge forward failed:', err.message);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bridge unreachable');
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AriaBridge LAN Relay Active');
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(\`[AriaRelay] Listening on http://0.0.0.0:\${LISTEN_PORT}/scale/upload\`);
  console.log(\`[AriaRelay] Forwarding binary frames -> \${BRIDGE_UPLOAD_URL}\`);
});
`;
}

export function generateKotlinHealthConnectWorker(bridgeUrl: string): string {
  const cleanUrl = (bridgeUrl || 'http://192.168.1.50:3000').replace(/\/$/, '');
  return `package com.ariabridge.sync

import android.content.Context
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.ZoneOffset

/**
 * AriaBridge Lab -> Android Health Connect Periodic Sync Worker
 *
 * Dependencies (build.gradle.kts):
 *   implementation("androidx.health.connect:connect-client:1.1.0-alpha11")
 *   implementation("androidx.work:work-runtime-ktx:2.9.1")
 *
 * Permissions (AndroidManifest.xml):
 *   <uses-permission android:name="android.permission.health.WRITE_WEIGHT" />
 *   <uses-permission android:name="android.permission.health.WRITE_BODY_FAT" />
 *   <uses-permission android:name="android.permission.INTERNET" />
 */
class AriaHealthConnectWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val bridgeUrl = inputData.getString("bridge_url") ?: "${cleanUrl}"
        val pairingToken = inputData.getString("pairing_token")
            ?: return@withContext Result.failure()

        val healthConnectClient = HealthConnectClient.getOrCreate(applicationContext)
        val deviceLabel = "\${Build.MANUFACTURER} \${Build.MODEL} (Health Connect)"

        // 1. Pull pending Aria Gen 1 weigh-ins from AriaBridge Lab
        val pendingConn = (URL("\$bridgeUrl/api/health-connect/pending").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Authorization", "Bearer \$pairingToken")
            setRequestProperty("X-Device-Name", deviceLabel)
            connectTimeout = 8000
            readTimeout = 8000
        }

        if (pendingConn.responseCode != 200) {
            return@withContext Result.retry()
        }

        val payload = JSONObject(pendingConn.inputStream.bufferedReader().readText())
        val items = payload.getJSONArray("records")
        if (items.length() == 0) {
            return@withContext Result.success()
        }

        val recordsToInsert = mutableListOf<androidx.health.connect.client.records.Record>()
        val syncedIds = mutableListOf<String>()

        val ariaDevice = Device(
            type = Device.TYPE_SCALE,
            manufacturer = "Fitbit",
            model = "Aria (Gen 1)"
        )

        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            val clientRecordId = item.getString("clientRecordId")
            val time = Instant.parse(item.getString("time"))
            val zoneOffset = ZoneOffset.of(item.optString("zoneOffset", "+00:00"))

            val weightObj = item.getJSONObject("weightRecord")
            val kg = weightObj.getJSONObject("weight").getDouble("inKilograms")

            recordsToInsert.add(
                WeightRecord(
                    time = time,
                    zoneOffset = zoneOffset,
                    weight = Mass.kilograms(kg),
                    metadata = Metadata.autoRecorded(
                        device = ariaDevice,
                        clientRecordId = "\$clientRecordId-weight",
                        clientRecordVersion = 1L
                    )
                )
            )

            if (!item.isNull("bodyFatRecord")) {
                val bfObj = item.getJSONObject("bodyFatRecord")
                val pct = bfObj.getJSONObject("percentage").getDouble("value")
                recordsToInsert.add(
                    BodyFatRecord(
                        time = time,
                        zoneOffset = zoneOffset,
                        percentage = Percentage(pct),
                        metadata = Metadata.autoRecorded(
                            device = ariaDevice,
                            clientRecordId = "\$clientRecordId-bodyfat",
                            clientRecordVersion = 1L
                        )
                    )
                )
            }

            syncedIds.add(clientRecordId)
        }

        // 2. Write idempotently into Android Health Connect (Google Fit reads automatically)
        healthConnectClient.insertRecords(recordsToInsert)

        // 3. Acknowledge synced IDs back to AriaBridge Lab
        val ackConn = (URL("\$bridgeUrl/api/health-connect/ack").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Authorization", "Bearer \$pairingToken")
            setRequestProperty("Content-Type", "application/json")
        }

        val ackBody = JSONObject().apply {
            put("deviceLabel", deviceLabel)
            put("clientRecordIds", JSONArray(syncedIds))
        }
        ackConn.outputStream.use { it.write(ackBody.toString().toByteArray(Charsets.UTF_8)) }

        if (ackConn.responseCode in 200..299) Result.success() else Result.retry()
    }
}
`;
}

export function generateTaskerWorkflowRecipe(bridgeUrl: string): string {
  const cleanUrl = (bridgeUrl || 'http://192.168.1.50:3000').replace(/\/$/, '');
  return `Tasker / MacroDroid Zero-Code Health Connect Sync Recipe
========================================================

Trigger:
  • Profile -> State -> Net -> Wi-Fi Connected (Home SSID)
  • Or Time -> Every 15 minutes while on home Wi-Fi

Action 1 — Pull Queued Weigh-Ins (HTTP Request):
  Method:  GET
  URL:     ${cleanUrl}/api/health-connect/pending
  Headers: Authorization: Bearer <PASTE_YOUR_PAIRING_TOKEN>
           X-Device-Name: Tasker Android

Action 2 — Parse JSON & Write to Health Connect:
  • If %http_data[pendingCount] > 0:
  • For each item in %http_data[records]:
    - Weight (kg):  %item.weightRecord.weight.inKilograms
    - Body Fat (%): %item.bodyFatRecord.percentage.value
    - Timestamp:    %item.time
    - Use Tasker Health Connect / Health Sync plugin to insert Weight & Body Fat

Action 3 — Acknowledge Synced Records (HTTP Request):
  Method:  POST
  URL:     ${cleanUrl}/api/health-connect/ack
  Headers: Authorization: Bearer <PASTE_YOUR_PAIRING_TOKEN>
           Content-Type: application/json
  Body:    {"deviceLabel":"Tasker Android","clientRecordIds":["<clientRecordId>"]}

Step 4 — Enable Automatic Google Fit Sync:
  Open Google Fit -> Profile -> Settings -> Sync Fit with Health Connect -> Turn ON.
  Every record written to Health Connect appears automatically in Google Fit.`;
}
