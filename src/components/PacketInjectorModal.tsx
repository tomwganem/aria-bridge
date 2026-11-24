import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  UserProfile,
  bytesToHex,
  decodeAriaPacket,
  encodeAriaPacket,
} from '../shared/ariaProtocol';

interface PacketInjectorModalProps {
  open: boolean;
  profiles: UserProfile[];
  defaultMac: string;
  onClose: () => void;
  onInjected: (packetId: string) => void;
}

export const PacketInjectorModal: React.FC<PacketInjectorModalProps> = ({
  open,
  profiles,
  defaultMac,
  onClose,
  onInjected,
}) => {
  const [userSlot, setUserSlot] = useState<number>(1);
  const [weightKg, setWeightKg] = useState<number>(74.1);
  const [bodyFatPercent, setBodyFatPercent] = useState<number>(18.1);
  const [impedanceOhms, setImpedanceOhms] = useState<number>(468);
  const [batteryPercent, setBatteryPercent] = useState<number>(84);
  const [firmwareVersion, setFirmwareVersion] = useState<number>(28);
  const [macAddress, setMacAddress] = useState<string>(defaultMac || '00:1D:C9:A4:2B:11');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const bytes = encodeAriaPacket({
      batteryPercent,
      macAddress,
      firmwareVersion,
      syncTimestamp: nowSec,
      measurementTimestamp: nowSec,
      impedanceOhms: userSlot === 0 ? 0 : impedanceOhms,
      weightGrams: Math.round(weightKg * 1000),
      userSlot,
      bodyFatPercent: userSlot === 0 ? 0 : bodyFatPercent,
    });
    const decoded = decodeAriaPacket(bytes);
    const hex = bytesToHex(bytes);
    const spacedHex = hex.match(/.{1,2}/g)?.join(' ') ?? '';
    return { bytes, decoded, spacedHex };
  }, [batteryPercent, macAddress, firmwareVersion, impedanceOhms, weightKg, userSlot, bodyFatPercent]);

  if (!open) return null;

  const handleProfilePreset = (slot: number) => {
    setUserSlot(slot);
    const found = profiles.find((p) => p.slot === slot);
    if (found && found.slot !== 0) {
      const mid = Math.round(((found.minWeightKg + found.maxWeightKg) / 2) * 10) / 10;
      if (mid > 30 && mid < 200) setWeightKg(mid);
    }
  };

  const handleTransmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const rawBytes = encodeAriaPacket({
        batteryPercent,
        macAddress,
        firmwareVersion,
        syncTimestamp: nowSec,
        measurementTimestamp: nowSec,
        impedanceOhms: userSlot === 0 ? 0 : impedanceOhms,
        weightGrams: Math.round(weightKg * 1000),
        userSlot,
        bodyFatPercent: userSlot === 0 ? 0 : bodyFatPercent,
      });

      // Sends a genuine raw 62-byte binary HTTP POST to the real /scale/upload endpoint
      const res = await fetch('/scale/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-AriaBridge-Origin': 'bench_injector',
        },
        body: rawBytes,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed with HTTP ${res.status}`);
      }

      const packetId = res.headers.get('X-AriaBridge-Packet-Id') || '';
      onInjected(packetId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transmit binary frame.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="injector-title"
    >
      <div className="w-full max-w-2xl border border-[#1E293B] bg-[#0F141F]">
        <div className="flex items-center justify-between border-b border-[#1E293B] px-6 py-4">
          <div>
            <h2 id="injector-title" className="text-base font-semibold text-[#F1F5F9]">
              Bench Binary Packet Injector
            </h2>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              Encodes a 62-byte little-endian Fitbit Aria Gen 1 frame and POSTs raw bytes to /scale/upload.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close injector"
            className="rounded-md p-2 text-[#94A3B8] transition-colors hover:bg-[#141B29] hover:text-[#F1F5F9] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleTransmit} className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inj-slot" className="block text-xs font-medium text-[#94A3B8]">
                User Profile Slot (Offset 0x1D)
              </label>
              <select
                id="inj-slot"
                value={userSlot}
                onChange={(e) => handleProfilePreset(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.slot} value={p.slot}>
                    Slot {p.slot} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inj-mac" className="block text-xs font-medium text-[#94A3B8]">
                Scale MAC Address (Offsets 0x03–0x08)
              </label>
              <input
                id="inj-mac"
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="inj-weight" className="flex items-center justify-between text-xs font-medium text-[#94A3B8]">
                <span>Body Weight (uint32 grams)</span>
                <span className="font-mono text-[#F1F5F9] tabular-nums">
                  {weightKg.toFixed(2)} kg · {(weightKg * 2.20462).toFixed(1)} lb
                </span>
              </label>
              <input
                id="inj-weight"
                type="number"
                step="0.05"
                min="10"
                max="250"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="inj-bf" className="flex items-center justify-between text-xs font-medium text-[#94A3B8]">
                <span>Body Fat (per-mille 0x1E)</span>
                <span className="font-mono text-[#F1F5F9] tabular-nums">
                  {userSlot === 0 ? 'Guest (0.0%)' : `${bodyFatPercent.toFixed(1)} %`}
                </span>
              </label>
              <input
                id="inj-bf"
                type="number"
                step="0.1"
                min="3"
                max="65"
                disabled={userSlot === 0}
                value={bodyFatPercent}
                onChange={(e) => setBodyFatPercent(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none disabled:opacity-45"
              />
            </div>

            <div>
              <label htmlFor="inj-imp" className="block text-xs font-medium text-[#94A3B8]">
                Bioimpedance (Ohms, Offset 0x13)
              </label>
              <input
                id="inj-imp"
                type="number"
                min="0"
                max="1500"
                disabled={userSlot === 0}
                value={impedanceOhms}
                onChange={(e) => setImpedanceOhms(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none disabled:opacity-45"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="inj-bat" className="block text-xs font-medium text-[#94A3B8]">
                  Battery (%)
                </label>
                <input
                  id="inj-bat"
                  type="number"
                  min="1"
                  max="100"
                  value={batteryPercent}
                  onChange={(e) => setBatteryPercent(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="inj-fw" className="block text-xs font-medium text-[#94A3B8]">
                  Firmware Rev
                </label>
                <input
                  id="inj-fw"
                  type="number"
                  min="1"
                  max="255"
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[#1E293B] pt-4">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span>Live 62-Byte Binary Frame Preview</span>
              <span className="font-mono text-[#10B981] tabular-nums">
                CRC-16 {preview.decoded.checksumHex} · 62 B
              </span>
            </div>
            <pre className="mt-2 overflow-x-auto border border-[#1E293B] bg-[#07090E] p-3 font-mono text-xs leading-relaxed text-[#CBD5E1] whitespace-pre-wrap break-all">
              {preview.spacedHex}
            </pre>
          </div>

          {error && (
            <p className="text-sm text-[#F43F5E]" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-[#1E293B] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#1E293B] bg-[#141B29] px-4 py-2 text-sm font-medium text-[#F1F5F9] transition-colors hover:border-[#334155] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] transition-colors hover:bg-[#22D3EE] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting ? 'Transmitting...' : 'POST to /scale/upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
