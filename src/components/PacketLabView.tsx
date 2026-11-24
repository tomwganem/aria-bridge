import React, { useMemo, useState } from 'react';
import { Copy, Download, Search, Check } from 'lucide-react';
import {
  ARIA_FIELD_SPECS,
  AriaFieldId,
  DecodedAriaPacket,
  PacketCapture,
  getFieldForOffset,
  hexToBytes,
} from '../shared/ariaProtocol';

interface PacketLabViewProps {
  packets: PacketCapture[];
  selectedPacketId: string | null;
  onSelectPacket: (id: string) => void;
  onHexPersisted: (packetId: string) => void;
  onNotify: (msg: string) => void;
}

function formatFieldDecodedValue(id: AriaFieldId, d: DecodedAriaPacket): string {
  switch (id) {
    case 'header':
      return d.headerHex;
    case 'battery':
      return `${d.batteryPercent} %`;
    case 'mac':
      return d.macAddress;
    case 'firmware':
      return `Rev ${d.firmwareVersion}`;
    case 'flags':
      return d.statusFlagsHex;
    case 'syncTimestamp':
      return `${d.syncTimestamp} (${new Date(d.syncTimestamp * 1000).toISOString().slice(11, 19)} UTC)`;
    case 'measurementCount':
      return `${d.measurementCount} record`;
    case 'impedance':
      return d.impedanceOhms > 0 ? `${d.impedanceOhms} Ω` : '0 Ω (Guest)';
    case 'weightGrams':
      return `${d.weightGrams.toLocaleString()} g (${d.weightKg.toFixed(2)} kg / ${d.weightLb.toFixed(1)} lb)`;
    case 'measurementTimestamp':
      return `${d.measurementTimestamp} (${new Date(d.measurementTimestamp * 1000).toISOString().replace('T', ' ').slice(0, 19)}Z)`;
    case 'userSlot':
      return d.userSlot === 0 ? 'Slot 0 (Guest)' : `Slot ${d.userSlot}`;
    case 'bodyFatPrimary':
      return `${d.bodyFatPerMille} ‰ (${d.bodyFatPercent.toFixed(1)} %)`;
    case 'variance':
      return d.variance.toFixed(4);
    case 'bodyFatSecondary':
      return `${Math.round(d.bodyFatRawPercent * 10)} ‰ (${d.bodyFatRawPercent.toFixed(1)} %)`;
    case 'reserved':
      return '22 B calibration & tare block';
    case 'checksum':
      return `${d.checksumHex} ${d.checksumValid ? '(Valid CRC-16)' : `(Expected ${d.expectedChecksumHex})`}`;
  }
}

function originLabel(origin: PacketCapture['origin']): string {
  if (origin === 'scale_http') return 'Scale HTTP';
  if (origin === 'bench_injector') return 'Bench Injector';
  return 'Hex Import';
}

export const PacketLabView: React.FC<PacketLabViewProps> = ({
  packets,
  selectedPacketId,
  onSelectPacket,
  onHexPersisted,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFieldId, setActiveFieldId] = useState<AriaFieldId | null>('weightGrams');
  const [lockedFieldId, setLockedFieldId] = useState<AriaFieldId | null>(null);
  const [hexInput, setHexInput] = useState('');
  const [hexDecodeResult, setHexDecodeResult] = useState<DecodedAriaPacket | null>(null);
  const [hexError, setHexError] = useState<string | null>(null);
  const [hexBusy, setHexBusy] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);

  const filteredPackets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return packets;
    return packets.filter(
      (p) =>
        p.decoded.macAddress.toLowerCase().includes(q) ||
        p.sourceIp.toLowerCase().includes(q) ||
        p.rawHex.toLowerCase().includes(q) ||
        String(p.decoded.weightKg).includes(q)
    );
  }, [packets, searchQuery]);

  const currentPacket = useMemo(() => {
    return (
      packets.find((p) => p.id === selectedPacketId) ??
      filteredPackets[0] ??
      packets[0] ??
      null
    );
  }, [packets, selectedPacketId, filteredPackets]);

  const packetBytes = useMemo((): Uint8Array<ArrayBuffer> => {
    if (!currentPacket) return new Uint8Array(new ArrayBuffer(0));
    try {
      return hexToBytes(currentPacket.rawHex);
    } catch {
      return new Uint8Array(new ArrayBuffer(0));
    }
  }, [currentPacket]);

  const highlightedFieldId = lockedFieldId ?? activeFieldId;
  const highlightedSpec = useMemo(
    () => ARIA_FIELD_SPECS.find((f) => f.id === highlightedFieldId) ?? null,
    [highlightedFieldId]
  );

  // Split bytes into 16-byte rows for canonical hex + ASCII workbench display
  const hexRows = useMemo(() => {
    const rows: Array<{ rowOffset: number; bytes: number[] }> = [];
    for (let i = 0; i < packetBytes.length; i += 16) {
      rows.push({
        rowOffset: i,
        bytes: Array.from(packetBytes.slice(i, i + 16)),
      });
    }
    return rows;
  }, [packetBytes]);

  const handleCopyHex = async () => {
    if (!currentPacket) return;
    const formatted = currentPacket.rawHex.match(/.{1,2}/g)?.join(' ') ?? currentPacket.rawHex;
    await navigator.clipboard.writeText(formatted);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 1600);
  };

  const handleDownloadBin = () => {
    if (!currentPacket || packetBytes.length === 0) return;
    const blob = new Blob([packetBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aria-frame-${currentPacket.id}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDecodeHexDump = async (persist: boolean) => {
    setHexError(null);
    setHexBusy(true);
    try {
      const res = await fetch('/api/packets/decode-hex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex: hexInput, persist }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to decode hex payload.');
      }
      setHexDecodeResult(data.decoded);
      if (persist && data.packet?.id) {
        onHexPersisted(data.packet.id);
        setHexInput('');
        onNotify('Decoded raw hex dump and saved weigh-in to local bridge store.');
      }
    } catch (err) {
      setHexError(err instanceof Error ? err.message : 'Unable to parse hex stream.');
    } finally {
      setHexBusy(false);
    }
  };

  const handleLoadSampleHex = () => {
    if (!currentPacket) return;
    setHexInput(currentPacket.rawHex.match(/.{1,2}/g)?.join(' ') ?? currentPacket.rawHex);
    setHexError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F1F5F9]">62-Byte Binary Packet Lab</h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Little-endian protocol dissector for HTTP POST /scale/upload · Click any byte or field row to lock highlight
          </p>
        </div>
        {currentPacket && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyHex}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0F141F] px-3 py-2 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#06B6D4] hover:text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedHex ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedHex ? 'Copied Hex' : 'Copy Hex'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadBin}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0F141F] px-3 py-2 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#06B6D4] hover:text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download .bin</span>
            </button>
          </div>
        )}
      </div>

      {/* Asymmetric Split Console: Left Capture Queue + Right Hex & Dissector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        {/* Left: Captured Frames List */}
        <aside className="flex flex-col border border-[#1E293B] bg-[#0F141F]">
          <div className="border-b border-[#1E293B] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by MAC, IP, weight..."
                className="w-full rounded border border-[#1E293B] bg-[#07090E] py-1.5 pr-3 pl-8 text-xs text-[#F1F5F9] placeholder-[#64748B] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[#64748B]">
              <span>{filteredPackets.length} captured frames</span>
              <span>POST /scale/upload</span>
            </div>
          </div>

          <div className="max-h-[640px] divide-y divide-[#1E293B] overflow-y-auto">
            {filteredPackets.map((pkt) => {
              const isSelected = currentPacket?.id === pkt.id;
              return (
                <button
                  key={pkt.id}
                  type="button"
                  onClick={() => onSelectPacket(pkt.id)}
                  className={`block w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#141B29]' : 'hover:bg-[#141B29]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-sm font-medium tabular-nums ${
                        isSelected ? 'text-[#06B6D4]' : 'text-[#F1F5F9]'
                      }`}
                    >
                      {pkt.decoded.weightKg.toFixed(2)} kg
                    </span>
                    <span className="font-mono text-[11px] text-[#94A3B8] tabular-nums">
                      {pkt.byteLength} B · Slot {pkt.decoded.userSlot}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[#94A3B8]">
                    <span>{originLabel(pkt.origin)} · {pkt.sourceIp}</span>
                    <span className={pkt.decoded.checksumValid ? 'text-[#10B981]' : 'text-[#F43F5E]'}>
                      {pkt.decoded.checksumValid ? 'CRC OK' : 'CRC ERR'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[#64748B] tabular-nums">
                    {new Date(pkt.receivedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </button>
              );
            })}
            {filteredPackets.length === 0 && (
              <div className="p-6 text-center text-xs text-[#94A3B8]">
                No binary captures match your filter.
              </div>
            )}
          </div>
        </aside>

        {/* Right: Hex Matrix + Synchronized Field Dissector */}
        <div className="space-y-6">
          {currentPacket ? (
            <>
              {/* Hex + ASCII Inspector Matrix */}
              <section className="border border-[#1E293B] bg-[#0F141F] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F1F5F9]">Raw 62-Byte Hex & ASCII Frame</h2>
                    <p className="mt-0.5 font-mono text-xs text-[#94A3B8]">
                      MAC {currentPacket.decoded.macAddress} · FW {currentPacket.decoded.firmwareVersion} ·{' '}
                      {currentPacket.decoded.checksumValid ? '● CRC-16 Verified' : '✖ CRC-16 Mismatch'}
                    </p>
                  </div>
                  {highlightedSpec && (
                    <div className="text-right">
                      <div className="font-mono text-xs text-[#06B6D4]">
                        {highlightedSpec.label} (0x
                        {highlightedSpec.offset.toString(16).toUpperCase().padStart(2, '0')}–0x
                        {(highlightedSpec.offset + highlightedSpec.length - 1)
                          .toString(16)
                          .toUpperCase()
                          .padStart(2, '0')}
                        )
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-[#F1F5F9]">
                        {formatFieldDecodedValue(highlightedSpec.id, currentPacket.decoded)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[660px] font-mono text-xs">
                    {/* Column Header */}
                    <div className="mb-2 grid grid-cols-[64px_1fr_144px] gap-4 text-[11px] text-[#64748B]">
                      <span>Offset</span>
                      <div className="grid grid-cols-16 gap-1 text-center">
                        {Array.from({ length: 16 }, (_, idx) => (
                          <span key={idx}>{idx.toString(16).toUpperCase().padStart(2, '0')}</span>
                        ))}
                      </div>
                      <span>ASCII</span>
                    </div>

                    {/* Byte Rows */}
                    <div className="space-y-1">
                      {hexRows.map((row) => (
                        <div
                          key={row.rowOffset}
                          className="grid grid-cols-[64px_1fr_144px] items-center gap-4 border-t border-[#1E293B]/60 py-1.5"
                        >
                          <span className="text-[#64748B]">
                            0x{row.rowOffset.toString(16).toUpperCase().padStart(4, '0')}
                          </span>
                          <div className="grid grid-cols-16 gap-1">
                            {Array.from({ length: 16 }, (_, colIdx) => {
                              const byteVal = row.bytes[colIdx];
                              const absOffset = row.rowOffset + colIdx;
                              if (byteVal === undefined) {
                                return <span key={colIdx} className="text-center text-[#1E293B]">--</span>;
                              }
                              const spec = getFieldForOffset(absOffset);
                              const isHighlighted = spec?.id === highlightedFieldId;
                              return (
                                <button
                                  key={colIdx}
                                  type="button"
                                  onMouseEnter={() => spec && setActiveFieldId(spec.id)}
                                  onClick={() =>
                                    spec &&
                                    setLockedFieldId((prev) => (prev === spec.id ? null : spec.id))
                                  }
                                  title={spec ? `${spec.label} (0x${absOffset.toString(16).toUpperCase().padStart(2, '0')})` : undefined}
                                  className={`rounded py-0.5 text-center transition-colors tabular-nums cursor-pointer ${
                                    isHighlighted
                                      ? 'bg-[#06B6D4] font-semibold text-[#07090E]'
                                      : 'text-[#CBD5E1] hover:bg-[#141B29] hover:text-[#F1F5F9]'
                                  }`}
                                >
                                  {byteVal.toString(16).toUpperCase().padStart(2, '0')}
                                </button>
                              );
                            })}
                          </div>
                          <div className="truncate tracking-widest text-[#94A3B8]">
                            {row.bytes
                              .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
                              .join('')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {highlightedSpec && (
                  <p className="mt-4 border-t border-[#1E293B] pt-3 text-xs text-[#94A3B8]">
                    <span className="font-medium text-[#F1F5F9]">{highlightedSpec.label}:</span>{' '}
                    {highlightedSpec.description}
                    {lockedFieldId && (
                      <button
                        type="button"
                        onClick={() => setLockedFieldId(null)}
                        className="ml-3 text-[#06B6D4] hover:underline cursor-pointer"
                      >
                        Clear lock
                      </button>
                    )}
                  </p>
                )}
              </section>

              {/* Offset-by-Offset Field Dissector Table */}
              <section className="border border-[#1E293B] bg-[#0F141F]">
                <div className="border-b border-[#1E293B] px-5 py-3.5">
                  <h2 className="text-base font-semibold text-[#F1F5F9]">Protocol Field Map</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                        <th className="px-5 py-2.5">Offset</th>
                        <th className="px-3 py-2.5">Len</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Field</th>
                        <th className="px-5 py-2.5 text-right">Decoded Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {ARIA_FIELD_SPECS.map((spec) => {
                        const isSelected = spec.id === highlightedFieldId;
                        const endOffset = spec.offset + spec.length - 1;
                        return (
                          <tr
                            key={spec.id}
                            onMouseEnter={() => setActiveFieldId(spec.id)}
                            onClick={() =>
                              setLockedFieldId((prev) => (prev === spec.id ? null : spec.id))
                            }
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-[#06B6D4]/12' : 'hover:bg-[#141B29]'
                            }`}
                          >
                            <td className="px-5 py-2.5 font-mono text-[#94A3B8] whitespace-nowrap">
                              0x{spec.offset.toString(16).toUpperCase().padStart(2, '0')}
                              {spec.length > 1
                                ? `–0x${endOffset.toString(16).toUpperCase().padStart(2, '0')}`
                                : ''}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[#64748B] tabular-nums">
                              {spec.length}B
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[#94A3B8] whitespace-nowrap">
                              {spec.dataType}
                            </td>
                            <td
                              className={`px-3 py-2.5 font-medium ${
                                isSelected ? 'text-[#06B6D4]' : 'text-[#F1F5F9]'
                              }`}
                            >
                              {spec.label}
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-[#F1F5F9] tabular-nums">
                              {formatFieldDecodedValue(spec.id, currentPacket.decoded)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="border border-[#1E293B] bg-[#0F141F] p-12 text-center text-sm text-[#94A3B8]">
              Select a binary packet capture on the left to dissect its 62-byte structure.
            </div>
          )}

          {/* Wireshark / tcpdump Raw Hex Paste & Decoder Workbench */}
          <section className="border border-[#1E293B] bg-[#0F141F] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#F1F5F9]">Raw Hex Capture Decoder</h2>
                <p className="mt-0.5 text-xs text-[#94A3B8]">
                  Paste a 62-byte hex stream from Wireshark or tcpdump to verify little-endian fields and optionally ingest it.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSampleHex}
                className="text-xs font-medium text-[#06B6D4] hover:text-[#22D3EE] cursor-pointer"
              >
                Load Selected Frame Hex
              </button>
            </div>

            <textarea
              rows={3}
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="Paste 124 hex characters (62 bytes), spaces/colons allowed..."
              className="mt-3 w-full rounded-md border border-[#1E293B] bg-[#07090E] p-3 font-mono text-xs text-[#F1F5F9] placeholder-[#64748B] focus:border-[#06B6D4] focus:outline-none"
            />

            {hexError && (
              <p className="mt-2 text-xs text-[#F43F5E]" role="alert">
                {hexError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={hexBusy || !hexInput.trim()}
                onClick={() => handleDecodeHexDump(false)}
                className="rounded-md border border-[#1E293B] bg-[#141B29] px-4 py-2 text-xs font-medium text-[#F1F5F9] transition-colors hover:border-[#06B6D4] disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Decode Preview Only
              </button>
              <button
                type="button"
                disabled={hexBusy || !hexInput.trim()}
                onClick={() => handleDecodeHexDump(true)}
                className="rounded-md bg-[#06B6D4] px-4 py-2 text-xs font-medium text-[#07090E] transition-colors hover:bg-[#22D3EE] disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Decode & Save Weigh-In
              </button>
            </div>

            {hexDecodeResult && (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#1E293B] pt-4 font-mono text-xs sm:grid-cols-4">
                <div>
                  <span className="text-[#64748B]">Weight</span>
                  <div className="mt-1 text-sm font-medium text-[#F1F5F9] tabular-nums">
                    {hexDecodeResult.weightKg.toFixed(2)} kg
                  </div>
                </div>
                <div>
                  <span className="text-[#64748B]">Body Fat / BIA</span>
                  <div className="mt-1 text-sm font-medium text-[#F1F5F9] tabular-nums">
                    {hexDecodeResult.bodyFatPercent.toFixed(1)}% · {hexDecodeResult.impedanceOhms} Ω
                  </div>
                </div>
                <div>
                  <span className="text-[#64748B]">Scale MAC</span>
                  <div className="mt-1 text-sm text-[#CBD5E1]">{hexDecodeResult.macAddress}</div>
                </div>
                <div>
                  <span className="text-[#64748B]">CRC-16 Check</span>
                  <div
                    className={`mt-1 text-sm ${
                      hexDecodeResult.checksumValid ? 'text-[#10B981]' : 'text-[#F59E0B]'
                    }`}
                  >
                    {hexDecodeResult.checksumValid ? '● Valid' : `▲ Mismatch (${hexDecodeResult.checksumHex})`}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
