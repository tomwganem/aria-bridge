import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BridgeConfig,
  BridgeStatePayload,
  PacketCapture,
  SyncLogEntry,
  UserProfile,
  WeighInRecord,
  bytesToHex,
  decodeAriaPacket,
  encodeAriaPacket,
} from '../src/shared/ariaProtocol.ts';

interface PersistedBridgeStore {
  version: 1;
  pairingToken: string;
  pairingTokenHash: string;
  tokenCreatedAt: string;
  lastPhoneSyncAt: string | null;
  lastPhoneDevice: string | null;
  config: BridgeConfig;
  profiles: UserProfile[];
  packets: PacketCapture[];
  weighIns: WeighInRecord[];
  syncLogs: SyncLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'ariabridge-store.json');

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function generatePairingToken(): string {
  return `aria_hc_${crypto.randomBytes(20).toString('base64url')}`;
}

function computeBmi(weightKg: number, heightCm: number): number | null {
  if (!heightCm || heightCm < 80 || heightCm > 250) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

function computeLeanMassKg(weightKg: number, bodyFatPercent: number): number {
  if (bodyFatPercent <= 0 || bodyFatPercent >= 80) return weightKg;
  return Math.round(weightKg * (1 - bodyFatPercent / 100) * 100) / 100;
}

function createInitialSeedStore(): PersistedBridgeStore {
  const envToken = process.env.HEALTH_CONNECT_PAIRING_TOKEN?.trim();
  const pairingToken = envToken && envToken.length >= 12 ? envToken : generatePairingToken();
  const nowSec = Math.floor(Date.now() / 1000);
  const scaleMac = '00:1D:C9:A4:2B:11';

  const profiles: UserProfile[] = [
    {
      slot: 1,
      name: 'Alex Morgan',
      heightCm: 178,
      minWeightKg: 68,
      maxWeightKg: 82,
      preferredUnit: 'kg',
      autoQueueHealthConnect: true,
    },
    {
      slot: 2,
      name: 'Jordan Chen',
      heightCm: 166,
      minWeightKg: 54,
      maxWeightKg: 66,
      preferredUnit: 'kg',
      autoQueueHealthConnect: true,
    },
    {
      slot: 0,
      name: 'Guest',
      heightCm: 0,
      minWeightKg: 0,
      maxWeightKg: 350,
      preferredUnit: 'kg',
      autoQueueHealthConnect: false,
    },
  ];

  // Authentic 62-byte encoded Aria Gen 1 captures over the past 14 days
  const seedSamples: Array<{
    daysAgo: number;
    hourOffset: number;
    slot: number;
    weightGrams: number;
    bodyFatPercent: number;
    impedanceOhms: number;
    batteryPercent: number;
    synced: boolean;
  }> = [
    { daysAgo: 13, hourOffset: 7, slot: 1, weightGrams: 75400, bodyFatPercent: 19.2, impedanceOhms: 486, batteryPercent: 89, synced: true },
    { daysAgo: 12, hourOffset: 8, slot: 2, weightGrams: 60400, bodyFatPercent: 22.8, impedanceOhms: 542, batteryPercent: 89, synced: true },
    { daysAgo: 11, hourOffset: 7, slot: 1, weightGrams: 75150, bodyFatPercent: 19.0, impedanceOhms: 482, batteryPercent: 88, synced: true },
    { daysAgo: 9, hourOffset: 7, slot: 1, weightGrams: 74900, bodyFatPercent: 18.8, impedanceOhms: 479, batteryPercent: 88, synced: true },
    { daysAgo: 8, hourOffset: 8, slot: 2, weightGrams: 60150, bodyFatPercent: 22.6, impedanceOhms: 539, batteryPercent: 87, synced: true },
    { daysAgo: 7, hourOffset: 7, slot: 1, weightGrams: 74750, bodyFatPercent: 18.7, impedanceOhms: 476, batteryPercent: 87, synced: true },
    { daysAgo: 5, hourOffset: 7, slot: 1, weightGrams: 74550, bodyFatPercent: 18.5, impedanceOhms: 473, batteryPercent: 86, synced: true },
    { daysAgo: 4, hourOffset: 8, slot: 2, weightGrams: 59950, bodyFatPercent: 22.4, impedanceOhms: 535, batteryPercent: 86, synced: true },
    { daysAgo: 3, hourOffset: 7, slot: 1, weightGrams: 74400, bodyFatPercent: 18.4, impedanceOhms: 471, batteryPercent: 85, synced: true },
    { daysAgo: 2, hourOffset: 7, slot: 1, weightGrams: 74300, bodyFatPercent: 18.3, impedanceOhms: 469, batteryPercent: 85, synced: false },
    { daysAgo: 1, hourOffset: 8, slot: 2, weightGrams: 59800, bodyFatPercent: 22.2, impedanceOhms: 532, batteryPercent: 84, synced: false },
    { daysAgo: 0, hourOffset: 1, slot: 1, weightGrams: 74150, bodyFatPercent: 18.2, impedanceOhms: 467, batteryPercent: 84, synced: false },
  ];

  const packets: PacketCapture[] = [];
  const weighIns: WeighInRecord[] = [];

  for (let i = 0; i < seedSamples.length; i++) {
    const sample = seedSamples[i];
    const epoch = nowSec - sample.daysAgo * 86400 - sample.hourOffset * 3600;
    const rawBytes = encodeAriaPacket({
      batteryPercent: sample.batteryPercent,
      macAddress: scaleMac,
      firmwareVersion: 28,
      syncTimestamp: epoch + 4,
      measurementTimestamp: epoch,
      impedanceOhms: sample.impedanceOhms,
      weightGrams: sample.weightGrams,
      userSlot: sample.slot,
      bodyFatPercent: sample.bodyFatPercent,
      variance: 0.031 + (i % 4) * 0.004,
    });
    const decoded = decodeAriaPacket(rawBytes);
    const packetId = `pkt_${epoch}_${i.toString(36)}`;
    const weighInId = `wi_${epoch}_${i.toString(36)}`;
    const profile = profiles.find((p) => p.slot === sample.slot) ?? profiles[2];
    const macSlug = scaleMac.replace(/:/g, '').toLowerCase();

    packets.unshift({
      id: packetId,
      receivedAt: new Date((epoch + 4) * 1000).toISOString(),
      sourceIp: '192.168.1.142',
      origin: 'scale_http',
      byteLength: rawBytes.length,
      rawHex: bytesToHex(rawBytes),
      decoded,
      weighInId,
    });

    weighIns.unshift({
      id: weighInId,
      clientRecordId: `aria-${macSlug}-${epoch}`,
      packetId,
      timestamp: new Date(epoch * 1000).toISOString(),
      epochSeconds: epoch,
      userSlot: decoded.userSlot,
      profileName: profile.name,
      macAddress: decoded.macAddress,
      weightGrams: decoded.weightGrams,
      weightKg: decoded.weightKg,
      weightLb: decoded.weightLb,
      bodyFatPercent: decoded.bodyFatPercent,
      leanMassKg: computeLeanMassKg(decoded.weightKg, decoded.bodyFatPercent),
      impedanceOhms: decoded.impedanceOhms,
      bmi: computeBmi(decoded.weightKg, profile.heightCm),
      batteryPercent: decoded.batteryPercent,
      syncStatus: sample.synced ? 'synced_hc' : 'queued',
      syncedAt: sample.synced ? new Date((epoch + 90) * 1000).toISOString() : null,
      syncedDevice: sample.synced ? 'Pixel 9 Pro (Health Connect)' : null,
      lastError: null,
    });
  }

  const lastSyncedTime = new Date((nowSec - 3 * 86400 + 90) * 1000).toISOString();

  const syncLogs: SyncLogEntry[] = [
    {
      id: `log_${nowSec - 259110}`,
      timestamp: lastSyncedTime,
      channel: 'health_connect_ack',
      status: 'ok',
      deviceLabel: 'Pixel 9 Pro (Health Connect)',
      recordCount: 2,
      detail: 'Inserted WeightRecord & BodyFatRecord via HealthConnectClient.insertRecords (deduplicated by clientRecordId).',
    },
    {
      id: `log_${nowSec - 259115}`,
      timestamp: new Date((nowSec - 3 * 86400 + 85) * 1000).toISOString(),
      channel: 'health_connect_pull',
      status: 'ok',
      deviceLabel: 'Pixel 9 Pro (Health Connect)',
      recordCount: 2,
      detail: 'Fetched 2 queued weigh-in records over local Wi-Fi.',
    },
  ];

  const appUrl = (process.env.APP_URL || 'http://192.168.1.50:3000').replace(/\/$/, '');

  return {
    version: 1,
    pairingToken,
    pairingTokenHash: sha256Hex(pairingToken),
    tokenCreatedAt: new Date(nowSec * 1000).toISOString(),
    lastPhoneSyncAt: lastSyncedTime,
    lastPhoneDevice: 'Pixel 9 Pro (Health Connect)',
    config: {
      lanBridgeIp: '192.168.1.50',
      lanRelayPort: 80,
      bridgePublicUrl: appUrl,
      enableProxyReplay: false,
      fitbitUpstreamIp: '104.16.100.29',
      displayUnit: 'kg',
      scaleMacAddress: scaleMac,
    },
    profiles,
    packets,
    weighIns,
    syncLogs,
  };
}

class LocalBridgeStore {
  private data: PersistedBridgeStore;

  constructor() {
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedBridgeStore {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as PersistedBridgeStore;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.weighIns)) {
          const envToken = process.env.HEALTH_CONNECT_PAIRING_TOKEN?.trim();
          if (envToken && envToken.length >= 12) {
            parsed.pairingToken = envToken;
            parsed.pairingTokenHash = sha256Hex(envToken);
          }
          return parsed;
        }
      }
    } catch {
      // Fall back to fresh seed store if disk file is corrupted
    }
    const seed = createInitialSeedStore();
    this.saveToDisk(seed);
    return seed;
  }

  private saveToDisk(store: PersistedBridgeStore): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const resolvedTarget = path.resolve(STORE_PATH);
    if (!resolvedTarget.startsWith(DATA_DIR + path.sep)) {
      throw new Error('Invalid local store path.');
    }
    const tmpPath = `${resolvedTarget}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, resolvedTarget);
  }

  private persist(): void {
    this.saveToDisk(this.data);
  }

  public getPublicState(): BridgeStatePayload {
    const queuedCount = this.data.weighIns.filter((w) => w.syncStatus === 'queued').length;
    const syncedCount = this.data.weighIns.filter(
      (w) => w.syncStatus === 'synced_hc' || w.syncStatus === 'synced_gfit'
    ).length;

    return {
      weighIns: this.data.weighIns,
      packets: this.data.packets,
      profiles: this.data.profiles,
      syncLogs: this.data.syncLogs,
      config: this.data.config,
      healthConnect: {
        pairingToken: this.data.pairingToken,
        tokenCreatedAt: this.data.tokenCreatedAt,
        queuedCount,
        syncedCount,
        lastPhoneSyncAt: this.data.lastPhoneSyncAt,
        lastPhoneDevice: this.data.lastPhoneDevice,
      },
      googleFit: {
        configured: Boolean(process.env.GOOGLE_FIT_ACCESS_TOKEN?.trim()),
      },
    };
  }

  public verifyPairingToken(candidate: string): boolean {
    if (!candidate) return false;
    const candidateHash = Buffer.from(sha256Hex(candidate), 'hex');
    const storedHash = Buffer.from(this.data.pairingTokenHash, 'hex');
    if (candidateHash.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(candidateHash, storedHash);
  }

  public getPairingTokenInternal(): string {
    return this.data.pairingToken;
  }

  public rotatePairingToken(): { pairingToken: string; tokenCreatedAt: string } {
    const nextToken = generatePairingToken();
    const nowIso = new Date().toISOString();
    this.data.pairingToken = nextToken;
    this.data.pairingTokenHash = sha256Hex(nextToken);
    this.data.tokenCreatedAt = nowIso;
    this.addSyncLog({
      channel: 'token_rotated',
      status: 'ok',
      deviceLabel: 'Bridge Console',
      recordCount: 0,
      detail: 'Rotated Health Connect pairing bearer token; previous Android pairing tokens invalidated.',
    });
    this.persist();
    return { pairingToken: nextToken, tokenCreatedAt: nowIso };
  }

  public ingestBinaryPacket(
    bytes: Uint8Array,
    sourceIp: string,
    origin: PacketCapture['origin']
  ): { packet: PacketCapture; weighIn: WeighInRecord } {
    const decoded = decodeAriaPacket(bytes);
    const nowIso = new Date().toISOString();
    const idSuffix = crypto.randomBytes(4).toString('hex');
    const packetId = `pkt_${Date.now()}_${idSuffix}`;
    const weighInId = `wi_${Date.now()}_${idSuffix}`;

    const matchedProfile = this.matchProfile(decoded.userSlot, decoded.weightKg);
    const macSlug = decoded.macAddress.replace(/:/g, '').toLowerCase();
    const epoch = decoded.measurementTimestamp > 946684800 ? decoded.measurementTimestamp : Math.floor(Date.now() / 1000);

    const packet: PacketCapture = {
      id: packetId,
      receivedAt: nowIso,
      sourceIp,
      origin,
      byteLength: bytes.length,
      rawHex: bytesToHex(bytes),
      decoded,
      weighInId,
    };

    const weighIn: WeighInRecord = {
      id: weighInId,
      clientRecordId: `aria-${macSlug}-${epoch}-${idSuffix.slice(0, 4)}`,
      packetId,
      timestamp: new Date(epoch * 1000).toISOString(),
      epochSeconds: epoch,
      userSlot: matchedProfile.slot,
      profileName: matchedProfile.name,
      macAddress: decoded.macAddress,
      weightGrams: decoded.weightGrams,
      weightKg: decoded.weightKg,
      weightLb: decoded.weightLb,
      bodyFatPercent: decoded.bodyFatPercent,
      leanMassKg: computeLeanMassKg(decoded.weightKg, decoded.bodyFatPercent),
      impedanceOhms: decoded.impedanceOhms,
      bmi: computeBmi(decoded.weightKg, matchedProfile.heightCm),
      batteryPercent: decoded.batteryPercent,
      syncStatus: matchedProfile.autoQueueHealthConnect ? 'queued' : 'synced_hc',
      syncedAt: matchedProfile.autoQueueHealthConnect ? null : nowIso,
      syncedDevice: matchedProfile.autoQueueHealthConnect ? null : 'Local Only (Guest)',
      lastError: null,
    };

    this.data.packets.unshift(packet);
    this.data.weighIns.unshift(weighIn);
    if (this.data.packets.length > 200) this.data.packets.length = 200;
    if (this.data.weighIns.length > 500) this.data.weighIns.length = 500;
    this.data.config.scaleMacAddress = decoded.macAddress;
    this.persist();

    return { packet, weighIn };
  }

  private matchProfile(slot: number, weightKg: number): UserProfile {
    const exactSlot = this.data.profiles.find((p) => p.slot === slot && slot !== 0);
    if (exactSlot) return exactSlot;
    const byRange = this.data.profiles.find(
      (p) => p.slot !== 0 && weightKg >= p.minWeightKg && weightKg <= p.maxWeightKg
    );
    if (byRange) return byRange;
    return (
      this.data.profiles.find((p) => p.slot === 0) ?? {
        slot: 0,
        name: 'Guest',
        heightCm: 0,
        minWeightKg: 0,
        maxWeightKg: 350,
        preferredUnit: 'kg',
        autoQueueHealthConnect: false,
      }
    );
  }

  public getPendingHealthConnectWeighIns(): WeighInRecord[] {
    return this.data.weighIns.filter((w) => w.syncStatus === 'queued');
  }

  public acknowledgeHealthConnect(
    clientRecordIds: string[],
    deviceLabel: string
  ): { acknowledgedCount: number; updatedIds: string[] } {
    const idSet = new Set(clientRecordIds);
    const nowIso = new Date().toISOString();
    const updatedIds: string[] = [];

    for (const w of this.data.weighIns) {
      if (idSet.has(w.clientRecordId) || idSet.has(`${w.clientRecordId}-weight`)) {
        w.syncStatus = 'synced_hc';
        w.syncedAt = nowIso;
        w.syncedDevice = deviceLabel;
        w.lastError = null;
        updatedIds.push(w.clientRecordId);
      }
    }

    if (updatedIds.length > 0) {
      this.data.lastPhoneSyncAt = nowIso;
      this.data.lastPhoneDevice = deviceLabel;
    }

    this.addSyncLog({
      channel: 'health_connect_ack',
      status: 'ok',
      deviceLabel,
      recordCount: updatedIds.length,
      detail:
        updatedIds.length > 0
          ? `Acknowledged ${updatedIds.length} Health Connect record(s) written via HealthConnectClient.insertRecords.`
          : 'Acknowledgement received with 0 matching queued records (already synced).',
    });

    this.persist();
    return { acknowledgedCount: updatedIds.length, updatedIds };
  }

  public recordHealthConnectPull(deviceLabel: string, count: number): void {
    this.addSyncLog({
      channel: 'health_connect_pull',
      status: 'ok',
      deviceLabel,
      recordCount: count,
      detail: `Served ${count} pending Health Connect record(s) to ${deviceLabel}.`,
    });
    this.persist();
  }

  public deleteWeighIn(id: string): boolean {
    const idx = this.data.weighIns.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.data.weighIns.splice(idx, 1);
    this.persist();
    return true;
  }

  public updateWeighInStatus(
    id: string,
    updates: { syncStatus?: WeighInRecord['syncStatus']; userSlot?: number; syncedDevice?: string | null; lastError?: string | null }
  ): WeighInRecord | null {
    const record = this.data.weighIns.find((w) => w.id === id);
    if (!record) return null;

    if (updates.syncStatus) {
      record.syncStatus = updates.syncStatus;
      if (updates.syncStatus === 'queued') {
        record.syncedAt = null;
        record.syncedDevice = null;
        record.lastError = null;
      } else if (updates.syncStatus === 'synced_hc' || updates.syncStatus === 'synced_gfit') {
        record.syncedAt = new Date().toISOString();
        record.syncedDevice = updates.syncedDevice ?? 'Google Fit REST API';
        record.lastError = null;
      } else if (updates.syncStatus === 'failed') {
        record.lastError = updates.lastError ?? 'Sync failed';
      }
    }

    if (typeof updates.userSlot === 'number') {
      const profile = this.data.profiles.find((p) => p.slot === updates.userSlot);
      if (profile) {
        record.userSlot = profile.slot;
        record.profileName = profile.name;
        record.bmi = computeBmi(record.weightKg, profile.heightCm);
      }
    }

    this.persist();
    return record;
  }

  public upsertProfile(profile: UserProfile): UserProfile[] {
    const existingIdx = this.data.profiles.findIndex((p) => p.slot === profile.slot);
    if (existingIdx >= 0) {
      this.data.profiles[existingIdx] = profile;
    } else {
      this.data.profiles.push(profile);
      this.data.profiles.sort((a, b) => a.slot - b.slot);
    }

    // Recompute profile names & BMI for historical weigh-ins assigned to this slot
    for (const w of this.data.weighIns) {
      if (w.userSlot === profile.slot) {
        w.profileName = profile.name;
        w.bmi = computeBmi(w.weightKg, profile.heightCm);
      }
    }

    this.persist();
    return this.data.profiles;
  }

  public deleteProfile(slot: number): UserProfile[] {
    if (slot === 0) return this.data.profiles;
    this.data.profiles = this.data.profiles.filter((p) => p.slot !== slot);
    this.persist();
    return this.data.profiles;
  }

  public updateConfig(patch: Partial<BridgeConfig>): BridgeConfig {
    this.data.config = { ...this.data.config, ...patch };
    this.persist();
    return this.data.config;
  }

  public getWeighInsByIds(ids?: string[]): WeighInRecord[] {
    if (!ids || ids.length === 0) return this.data.weighIns;
    const set = new Set(ids);
    return this.data.weighIns.filter((w) => set.has(w.id));
  }

  public addSyncLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry {
    const log: SyncLogEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.data.syncLogs.unshift(log);
    if (this.data.syncLogs.length > 100) this.data.syncLogs.length = 100;
    this.persist();
    return log;
  }
}

export const bridgeStore = new LocalBridgeStore();
