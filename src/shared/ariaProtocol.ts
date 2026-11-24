export type SyncStatus = 'queued' | 'synced_hc' | 'synced_gfit' | 'failed';

export type AriaFieldId =
  | 'header'
  | 'battery'
  | 'mac'
  | 'firmware'
  | 'flags'
  | 'syncTimestamp'
  | 'measurementCount'
  | 'impedance'
  | 'weightGrams'
  | 'measurementTimestamp'
  | 'userSlot'
  | 'bodyFatPrimary'
  | 'variance'
  | 'bodyFatSecondary'
  | 'reserved'
  | 'checksum';

export interface AriaFieldSpec {
  id: AriaFieldId;
  label: string;
  offset: number;
  length: number;
  dataType: string;
  unit: string;
  description: string;
}

export const ARIA_PACKET_SIZE = 62;
export const ARIA_MAGIC_HEADER = 0x103e;

export const ARIA_FIELD_SPECS: AriaFieldSpec[] = [
  {
    id: 'header',
    label: 'Frame Magic Header',
    offset: 0x00,
    length: 2,
    dataType: 'uint16 LE',
    unit: 'hex',
    description: 'Identifies Fitbit Aria Gen 1 upload frame structure and length signature.',
  },
  {
    id: 'battery',
    label: 'Battery Capacity',
    offset: 0x02,
    length: 1,
    dataType: 'uint8',
    unit: '%',
    description: 'Remaining AA battery cell percentage reported by the scale power controller.',
  },
  {
    id: 'mac',
    label: 'Scale MAC Address',
    offset: 0x03,
    length: 6,
    dataType: '6 bytes',
    unit: 'EUI-48',
    description: 'Unique hardware Wi-Fi MAC address (Fitbit OUI 00:1D:C9 or B0:4E:26).',
  },
  {
    id: 'firmware',
    label: 'Firmware Build',
    offset: 0x09,
    length: 1,
    dataType: 'uint8',
    unit: 'rev',
    description: 'Embedded firmware revision running on the Aria Gen 1 MCU.',
  },
  {
    id: 'flags',
    label: 'Scale Status Flags',
    offset: 0x0a,
    length: 4,
    dataType: 'uint32 LE',
    unit: 'bitmask',
    description: 'Hardware mode, unit display preference, and calibration status register.',
  },
  {
    id: 'syncTimestamp',
    label: 'Sync Timestamp',
    offset: 0x0e,
    length: 4,
    dataType: 'uint32 LE',
    unit: 'epoch s',
    description: 'Unix timestamp when the scale initiated the Wi-Fi HTTP upload.',
  },
  {
    id: 'measurementCount',
    label: 'Measurement Count',
    offset: 0x12,
    length: 1,
    dataType: 'uint8',
    unit: 'count',
    description: 'Number of queued weigh-in records included in this transmission.',
  },
  {
    id: 'impedance',
    label: 'Electrical Impedance',
    offset: 0x13,
    length: 2,
    dataType: 'uint16 LE',
    unit: 'Ω',
    description: 'Raw bioelectrical impedance measured across the ITO glass footpads (0 if guest).',
  },
  {
    id: 'weightGrams',
    label: 'Body Weight',
    offset: 0x15,
    length: 4,
    dataType: 'uint32 LE',
    unit: 'g',
    description: 'Calibrated load-cell body mass encoded in whole grams (divide by 1000 for kg).',
  },
  {
    id: 'measurementTimestamp',
    label: 'Measurement Time',
    offset: 0x19,
    length: 4,
    dataType: 'uint32 LE',
    unit: 'epoch s',
    description: 'Unix timestamp captured at the exact moment the load cells stabilized.',
  },
  {
    id: 'userSlot',
    label: 'User Profile Slot',
    offset: 0x1d,
    length: 1,
    dataType: 'uint8',
    unit: 'slot',
    description: 'Scale-assigned user slot index (0 = Guest, 1–8 = Registered household member).',
  },
  {
    id: 'bodyFatPrimary',
    label: 'Body Fat (Displayed)',
    offset: 0x1e,
    length: 2,
    dataType: 'uint16 LE',
    unit: '‰ (0.1%)',
    description: 'Displayed body fat percentage in per-mille (e.g., 184 = 18.4%).',
  },
  {
    id: 'variance',
    label: 'Measurement Variance',
    offset: 0x20,
    length: 4,
    dataType: 'float32 LE',
    unit: 'σ²',
    description: 'Statistical load-cell stability and user-match confidence variance.',
  },
  {
    id: 'bodyFatSecondary',
    label: 'Body Fat (Raw BIA)',
    offset: 0x24,
    length: 2,
    dataType: 'uint16 LE',
    unit: '‰ (0.1%)',
    description: 'Unfiltered secondary BIA composition estimate before smoothing.',
  },
  {
    id: 'reserved',
    label: 'Calibration & Padding',
    offset: 0x26,
    length: 22,
    dataType: '22 bytes',
    unit: 'raw',
    description: 'Factory zero-tare offsets, temperature compensation, and reserved trailing block.',
  },
  {
    id: 'checksum',
    label: 'CRC-16 Frame Check',
    offset: 0x3c,
    length: 2,
    dataType: 'uint16 LE',
    unit: 'CRC-16',
    description: 'CRC-16/CCITT-FALSE integrity check calculated over offsets 0x00–0x3B.',
  },
];

export interface DecodedAriaPacket {
  headerHex: string;
  batteryPercent: number;
  macAddress: string;
  firmwareVersion: number;
  statusFlagsHex: string;
  syncTimestamp: number;
  measurementCount: number;
  impedanceOhms: number;
  weightGrams: number;
  weightKg: number;
  weightLb: number;
  measurementTimestamp: number;
  userSlot: number;
  bodyFatPercent: number;
  bodyFatPerMille: number;
  variance: number;
  bodyFatRawPercent: number;
  checksumHex: string;
  expectedChecksumHex: string;
  checksumValid: boolean;
}

export interface EncodeAriaPacketInput {
  batteryPercent: number;
  macAddress: string;
  firmwareVersion: number;
  syncTimestamp: number;
  measurementTimestamp: number;
  impedanceOhms: number;
  weightGrams: number;
  userSlot: number;
  bodyFatPercent: number;
  variance?: number;
}

export interface PacketCapture {
  id: string;
  receivedAt: string;
  sourceIp: string;
  origin: 'scale_http' | 'bench_injector' | 'hex_import';
  byteLength: number;
  rawHex: string;
  decoded: DecodedAriaPacket;
  weighInId: string | null;
}

export interface UserProfile {
  slot: number;
  name: string;
  heightCm: number;
  minWeightKg: number;
  maxWeightKg: number;
  preferredUnit: 'kg' | 'lb';
  autoQueueHealthConnect: boolean;
}

export interface WeighInRecord {
  id: string;
  clientRecordId: string;
  packetId: string;
  timestamp: string;
  epochSeconds: number;
  userSlot: number;
  profileName: string;
  macAddress: string;
  weightGrams: number;
  weightKg: number;
  weightLb: number;
  bodyFatPercent: number;
  leanMassKg: number;
  impedanceOhms: number;
  bmi: number | null;
  batteryPercent: number;
  syncStatus: SyncStatus;
  syncedAt: string | null;
  syncedDevice: string | null;
  lastError: string | null;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  channel: 'health_connect_pull' | 'health_connect_ack' | 'google_fit_rest' | 'csv_export' | 'json_export' | 'token_rotated';
  status: 'ok' | 'dry_run' | 'error';
  deviceLabel: string;
  recordCount: number;
  detail: string;
}

export interface BridgeConfig {
  lanBridgeIp: string;
  lanRelayPort: number;
  bridgePublicUrl: string;
  enableProxyReplay: boolean;
  fitbitUpstreamIp: string;
  displayUnit: 'kg' | 'lb';
  scaleMacAddress: string;
}

export interface HealthConnectRecordItem {
  clientRecordId: string;
  weighInId: string;
  profileName: string;
  time: string;
  zoneOffset: string;
  weightRecord: {
    recordType: 'WeightRecord';
    time: string;
    zoneOffset: string;
    weight: { inKilograms: number };
    metadata: {
      clientRecordId: string;
      clientRecordVersion: number;
      recordingMethod: 'RECORDING_METHOD_AUTOMATICALLY_RECORDED';
      device: {
        type: 'TYPE_SCALE';
        manufacturer: 'Fitbit';
        model: 'Aria (Gen 1)';
      };
    };
  };
  bodyFatRecord: {
    recordType: 'BodyFatRecord';
    time: string;
    zoneOffset: string;
    percentage: { value: number };
    metadata: {
      clientRecordId: string;
      clientRecordVersion: number;
      recordingMethod: 'RECORDING_METHOD_AUTOMATICALLY_RECORDED';
      device: {
        type: 'TYPE_SCALE';
        manufacturer: 'Fitbit';
        model: 'Aria (Gen 1)';
      };
    };
  } | null;
}

export interface BridgeStatePayload {
  weighIns: WeighInRecord[];
  packets: PacketCapture[];
  profiles: UserProfile[];
  syncLogs: SyncLogEntry[];
  config: BridgeConfig;
  healthConnect: {
    pairingToken: string;
    tokenCreatedAt: string;
    queuedCount: number;
    syncedCount: number;
    lastPhoneSyncAt: string | null;
    lastPhoneDevice: string | null;
  };
  googleFit: {
    configured: boolean;
  };
}

export function crc16Ccitt(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export function parseMacBytes(mac: string): Uint8Array {
  const cleaned = mac.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    const pair = cleaned.slice(i * 2, i * 2 + 2);
    out[i] = pair.length === 2 ? parseInt(pair, 16) : 0;
  }
  return out;
}

export function formatMacBytes(bytes: Uint8Array, offset: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    parts.push(bytes[offset + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(':');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
}

export function hexToBytes(hexInput: string): Uint8Array<ArrayBuffer> {
  const cleaned = hexInput.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    throw new Error('Hex payload must contain an even number of hexadecimal characters.');
  }
  const bytes = new Uint8Array(new ArrayBuffer(cleaned.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function encodeAriaPacket(input: EncodeAriaPacketInput): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(ARIA_PACKET_SIZE);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const battery = Math.max(0, Math.min(100, Math.round(input.batteryPercent)));
  const firmware = Math.max(1, Math.min(255, Math.round(input.firmwareVersion)));
  const impedance = Math.max(0, Math.min(2000, Math.round(input.impedanceOhms)));
  const weightGrams = Math.max(5000, Math.min(350000, Math.round(input.weightGrams)));
  const userSlot = Math.max(0, Math.min(8, Math.round(input.userSlot)));
  const bodyFatPerMille = Math.max(0, Math.min(750, Math.round(input.bodyFatPercent * 10)));
  const rawBodyFatPerMille = Math.max(0, Math.min(750, bodyFatPerMille + (impedance > 0 ? 3 : 0)));
  const variance = typeof input.variance === 'number' ? input.variance : 0.042;

  // 0x00–0x01: Magic Header
  view.setUint16(0x00, ARIA_MAGIC_HEADER, true);
  // 0x02: Battery %
  view.setUint8(0x02, battery);
  // 0x03–0x08: MAC Address
  const macBytes = parseMacBytes(input.macAddress || '00:1D:C9:A4:2B:11');
  bytes.set(macBytes, 0x03);
  // 0x09: Firmware version
  view.setUint8(0x09, firmware);
  // 0x0A–0x0D: Status flags (standard Aria Gen 1 normal weigh-in bitmask)
  view.setUint32(0x0a, 0x00000102, true);
  // 0x0E–0x11: Sync timestamp
  view.setUint32(0x0e, Math.floor(input.syncTimestamp), true);
  // 0x12: Measurement count
  view.setUint8(0x12, 1);
  // 0x13–0x14: Electrical impedance (Ohms)
  view.setUint16(0x13, impedance, true);
  // 0x15–0x18: Weight in grams
  view.setUint32(0x15, weightGrams, true);
  // 0x19–0x1C: Measurement timestamp
  view.setUint32(0x19, Math.floor(input.measurementTimestamp), true);
  // 0x1D: User slot
  view.setUint8(0x1d, userSlot);
  // 0x1E–0x1F: Primary body fat (per-mille)
  view.setUint16(0x1e, bodyFatPerMille, true);
  // 0x20–0x23: Variance (float32 LE)
  view.setFloat32(0x20, variance, true);
  // 0x24–0x25: Secondary raw body fat (per-mille)
  view.setUint16(0x24, rawBodyFatPerMille, true);

  // 0x26–0x3B: Deterministic hardware calibration tare markers
  bytes[0x26] = 0x41; // 'A'
  bytes[0x27] = 0x52; // 'R'
  bytes[0x28] = 0x01;
  bytes[0x29] = 0x00;
  view.setUint16(0x2a, 215, true); // Internal PCB ambient temp 21.5 C
  view.setUint16(0x2c, 1024, true); // Load cell zero tare baseline

  // 0x3C–0x3D: CRC-16/CCITT-FALSE
  const checksum = crc16Ccitt(bytes, 0x3c);
  view.setUint16(0x3c, checksum, true);

  return bytes;
}

export function decodeAriaPacket(bytes: Uint8Array): DecodedAriaPacket {
  if (bytes.length < ARIA_PACKET_SIZE) {
    throw new Error(`Aria Gen 1 packet requires at least ${ARIA_PACKET_SIZE} bytes (received ${bytes.length} bytes).`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = view.getUint16(0x00, true);
  const batteryPercent = view.getUint8(0x02);
  const macAddress = formatMacBytes(bytes, 0x03);
  const firmwareVersion = view.getUint8(0x09);
  const statusFlags = view.getUint32(0x0a, true);
  const syncTimestamp = view.getUint32(0x0e, true);
  const measurementCount = view.getUint8(0x12);
  const impedanceOhms = view.getUint16(0x13, true);
  const weightGrams = view.getUint32(0x15, true);
  const measurementTimestamp = view.getUint32(0x19, true);
  const userSlot = view.getUint8(0x1d);
  const bodyFatPerMille = view.getUint16(0x1e, true);
  const variance = view.getFloat32(0x20, true);
  const bodyFatRawPerMille = view.getUint16(0x24, true);
  const checksum = view.getUint16(0x3c, true);
  const expectedChecksum = crc16Ccitt(bytes, 0x3c);

  const weightKg = Math.round((weightGrams / 1000) * 100) / 100;
  const weightLb = Math.round(weightKg * 2.20462262 * 100) / 100;
  const bodyFatPercent = Math.round((bodyFatPerMille / 10) * 10) / 10;
  const bodyFatRawPercent = Math.round((bodyFatRawPerMille / 10) * 10) / 10;

  return {
    headerHex: `0x${header.toString(16).toUpperCase().padStart(4, '0')}`,
    batteryPercent,
    macAddress,
    firmwareVersion,
    statusFlagsHex: `0x${statusFlags.toString(16).toUpperCase().padStart(8, '0')}`,
    syncTimestamp,
    measurementCount,
    impedanceOhms,
    weightGrams,
    weightKg,
    weightLb,
    measurementTimestamp,
    userSlot,
    bodyFatPercent,
    bodyFatPerMille,
    variance: Number.isFinite(variance) ? Math.round(variance * 10000) / 10000 : 0,
    bodyFatRawPercent,
    checksumHex: `0x${checksum.toString(16).toUpperCase().padStart(4, '0')}`,
    expectedChecksumHex: `0x${expectedChecksum.toString(16).toUpperCase().padStart(4, '0')}`,
    checksumValid: checksum === expectedChecksum,
  };
}

export function getFieldForOffset(byteOffset: number): AriaFieldSpec | undefined {
  return ARIA_FIELD_SPECS.find(
    (spec) => byteOffset >= spec.offset && byteOffset < spec.offset + spec.length
  );
}

export function buildAriaAckFrame(epochSeconds: number): Uint8Array {
  const buf = new ArrayBuffer(16);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // Minimal HTTP 200 binary acknowledgement frame expected by Aria Gen 1
  view.setUint16(0, 0x0001, true); // ACK OK
  view.setUint16(2, 0x0010, true); // Frame length 16
  view.setUint32(4, Math.floor(epochSeconds), true); // Authoritative server epoch time
  view.setUint32(8, 0x00000000, true); // No pending OTA firmware update
  const crc = crc16Ccitt(bytes, 14);
  view.setUint16(14, crc, true);
  return bytes;
}

export function buildHealthConnectRecord(record: WeighInRecord): HealthConnectRecordItem {
  const isoTime = record.timestamp;
  const zoneOffset = '+00:00';
  return {
    clientRecordId: record.clientRecordId,
    weighInId: record.id,
    profileName: record.profileName,
    time: isoTime,
    zoneOffset,
    weightRecord: {
      recordType: 'WeightRecord',
      time: isoTime,
      zoneOffset,
      weight: { inKilograms: record.weightKg },
      metadata: {
        clientRecordId: `${record.clientRecordId}-weight`,
        clientRecordVersion: 1,
        recordingMethod: 'RECORDING_METHOD_AUTOMATICALLY_RECORDED',
        device: {
          type: 'TYPE_SCALE',
          manufacturer: 'Fitbit',
          model: 'Aria (Gen 1)',
        },
      },
    },
    bodyFatRecord:
      record.bodyFatPercent > 0
        ? {
            recordType: 'BodyFatRecord',
            time: isoTime,
            zoneOffset,
            percentage: { value: record.bodyFatPercent },
            metadata: {
              clientRecordId: `${record.clientRecordId}-bodyfat`,
              clientRecordVersion: 1,
              recordingMethod: 'RECORDING_METHOD_AUTOMATICALLY_RECORDED',
              device: {
                type: 'TYPE_SCALE',
                manufacturer: 'Fitbit',
                model: 'Aria (Gen 1)',
              },
            },
          }
        : null,
  };
}

export function buildGoogleFitDatasetPayloads(record: WeighInRecord) {
  const timeNanos = `${BigInt(record.epochSeconds) * 1000000000n}`;
  const weightDataSourceId = 'raw:com.google.weight:ariabridge_lab:fitbit_aria_gen1';
  const bodyFatDataSourceId = 'raw:com.google.body.fat.percentage:ariabridge_lab:fitbit_aria_gen1';

  return {
    weightEndpoint: `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(weightDataSourceId)}/datasets/${timeNanos}-${timeNanos}`,
    weightBody: {
      dataSourceId: weightDataSourceId,
      minStartTimeNs: timeNanos,
      maxEndTimeNs: timeNanos,
      point: [
        {
          dataTypeName: 'com.google.weight',
          startTimeNanos: timeNanos,
          endTimeNanos: timeNanos,
          value: [{ fpVal: record.weightKg }],
        },
      ],
    },
    bodyFatEndpoint:
      record.bodyFatPercent > 0
        ? `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(bodyFatDataSourceId)}/datasets/${timeNanos}-${timeNanos}`
        : null,
    bodyFatBody:
      record.bodyFatPercent > 0
        ? {
            dataSourceId: bodyFatDataSourceId,
            minStartTimeNs: timeNanos,
            maxEndTimeNs: timeNanos,
            point: [
              {
                dataTypeName: 'com.google.body.fat.percentage',
                startTimeNanos: timeNanos,
                endTimeNanos: timeNanos,
                value: [{ fpVal: record.bodyFatPercent }],
              },
            ],
          }
        : null,
  };
}
