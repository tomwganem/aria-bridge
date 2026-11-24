import React, { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Trash2 } from 'lucide-react';
import { BridgeStatePayload, WeighInRecord } from '../shared/ariaProtocol';

interface OverviewViewProps {
  state: BridgeStatePayload;
  displayUnit: 'kg' | 'lb';
  onChangeUnit: (unit: 'kg' | 'lb') => void;
  onInspectPacket: (packetId: string) => void;
  onRequeueWeighIn: (id: string) => void;
  onRequestDeleteWeighIn: (record: WeighInRecord) => void;
  onOpenHealthConnect: () => void;
  onOpenInjector: () => void;
}

function formatWeight(record: WeighInRecord, unit: 'kg' | 'lb'): string {
  return unit === 'kg' ? record.weightKg.toFixed(2) : record.weightLb.toFixed(1);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderSyncStatus(status: WeighInRecord['syncStatus']) {
  if (status === 'synced_hc') {
    return <span className="font-mono text-xs text-[#10B981]">● Synced (HC)</span>;
  }
  if (status === 'synced_gfit') {
    return <span className="font-mono text-xs text-[#10B981]">● Synced (Fit)</span>;
  }
  if (status === 'failed') {
    return <span className="font-mono text-xs text-[#F43F5E]">✖ Failed</span>;
  }
  return <span className="font-mono text-xs text-[#F59E0B]">▲ Queued</span>;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  state,
  displayUnit,
  onChangeUnit,
  onInspectPacket,
  onRequeueWeighIn,
  onRequestDeleteWeighIn,
  onOpenHealthConnect,
  onOpenInjector,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<number | 'all'>(1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const filteredWeighIns = useMemo(() => {
    if (selectedSlot === 'all') return state.weighIns;
    return state.weighIns.filter((w) => w.userSlot === selectedSlot);
  }, [state.weighIns, selectedSlot]);

  // Chronological order for chart plotting (oldest -> newest)
  const chartPoints = useMemo(() => {
    return [...filteredWeighIns].slice(0, 20).reverse();
  }, [filteredWeighIns]);

  const latest = filteredWeighIns[0] ?? state.weighIns[0] ?? null;
  const previous = filteredWeighIns[1] ?? null;

  const weightDelta = useMemo(() => {
    if (!latest || !previous) return null;
    const diff =
      displayUnit === 'kg'
        ? latest.weightKg - previous.weightKg
        : latest.weightLb - previous.weightLb;
    return Math.round(diff * 100) / 100;
  }, [latest, previous, displayUnit]);

  const bfDelta = useMemo(() => {
    if (!latest || !previous || latest.bodyFatPercent === 0 || previous.bodyFatPercent === 0) return null;
    return Math.round((latest.bodyFatPercent - previous.bodyFatPercent) * 10) / 10;
  }, [latest, previous]);

  // SVG chart geometry
  const chartMetrics = useMemo(() => {
    const width = 920;
    const height = 270;
    const padLeft = 52;
    const padRight = 52;
    const padTop = 24;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (chartPoints.length === 0) {
      return { width, height, padLeft, padRight, padTop, padBottom, plotW, plotH, points: [], wMin: 0, wMax: 100, bfMin: 0, bfMax: 40 };
    }

    const weights = chartPoints.map((p) => (displayUnit === 'kg' ? p.weightKg : p.weightLb));
    const bfs = chartPoints.map((p) => p.bodyFatPercent).filter((v) => v > 0);

    const wRawMin = Math.min(...weights);
    const wRawMax = Math.max(...weights);
    const wMargin = Math.max(0.8, (wRawMax - wRawMin) * 0.25);
    const wMin = Math.floor((wRawMin - wMargin) * 10) / 10;
    const wMax = Math.ceil((wRawMax + wMargin) * 10) / 10;

    const bfRawMin = bfs.length ? Math.min(...bfs) : 10;
    const bfRawMax = bfs.length ? Math.max(...bfs) : 30;
    const bfMargin = Math.max(1.0, (bfRawMax - bfRawMin) * 0.3);
    const bfMin = Math.max(0, Math.floor((bfRawMin - bfMargin) * 10) / 10);
    const bfMax = Math.ceil((bfRawMax + bfMargin) * 10) / 10;

    const points = chartPoints.map((rec, idx) => {
      const x =
        chartPoints.length === 1
          ? padLeft + plotW / 2
          : padLeft + (idx / (chartPoints.length - 1)) * plotW;
      const wVal = displayUnit === 'kg' ? rec.weightKg : rec.weightLb;
      const yWeight = padTop + ((wMax - wVal) / Math.max(0.1, wMax - wMin)) * plotH;
      const yBf =
        rec.bodyFatPercent > 0
          ? padTop + ((bfMax - rec.bodyFatPercent) / Math.max(0.1, bfMax - bfMin)) * plotH
          : null;
      return { x, yWeight, yBf, record: rec, wVal };
    });

    return { width, height, padLeft, padRight, padTop, padBottom, plotW, plotH, points, wMin, wMax, bfMin, bfMax };
  }, [chartPoints, displayUnit]);

  const weightPath = chartMetrics.points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.yWeight.toFixed(1)}`)
    .join(' ');

  const bfPath = chartMetrics.points
    .filter((pt) => pt.yBf !== null)
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${(pt.yBf as number).toFixed(1)}`)
    .join(' ');

  const activeHoverPoint =
    hoverIdx !== null && chartMetrics.points[hoverIdx]
      ? chartMetrics.points[hoverIdx]
      : chartMetrics.points[chartMetrics.points.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* Workspace Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F1F5F9]">Scale Telemetry Overview</h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Fitbit Aria Gen 1 · MAC {state.config.scaleMacAddress} · {state.healthConnect.queuedCount} queued for Health Connect
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Household Profile Filter Buttons */}
          <div className="flex items-center gap-1 rounded-md border border-[#1E293B] bg-[#0F141F] p-1">
            <button
              type="button"
              onClick={() => {
                setSelectedSlot('all');
                setHoverIdx(null);
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSlot === 'all'
                  ? 'bg-[#141B29] text-[#F1F5F9]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              All Users
            </button>
            {state.profiles.map((prof) => (
              <button
                key={prof.slot}
                type="button"
                onClick={() => {
                  setSelectedSlot(prof.slot);
                  setHoverIdx(null);
                }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedSlot === prof.slot
                    ? 'bg-[#141B29] text-[#06B6D4]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {prof.name}
              </button>
            ))}
          </div>

          {/* Interactive Unit Segmented Control */}
          <div className="flex items-center gap-1 rounded-md border border-[#1E293B] bg-[#0F141F] p-1">
            {(['kg', 'lb'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => onChangeUnit(unit)}
                className={`rounded px-2.5 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  displayUnit === unit
                    ? 'bg-[#06B6D4] text-[#07090E]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary KPI Metric Strip (Single-Elevation Hairline Grid) */}
      <div className="grid grid-cols-1 border border-[#1E293B] bg-[#0F141F] sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-[#1E293B]">
        <div className="p-5">
          <div className="text-xs font-medium text-[#94A3B8]">Latest Weight</div>
          <div className="mt-2 flex items-baseline">
            <span className="font-mono text-3xl font-semibold text-[#F1F5F9] tabular-nums">
              {latest ? formatWeight(latest, displayUnit) : '—'}
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#94A3B8]">{displayUnit}</span>
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-[#94A3B8]">
            {weightDelta !== null
              ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(2)} ${displayUnit} vs prior`
              : 'No prior reading'}
          </div>
        </div>

        <div className="border-t border-[#1E293B] p-5 sm:border-t-0">
          <div className="text-xs font-medium text-[#94A3B8]">Body Fat Composition</div>
          <div className="mt-2 flex items-baseline">
            <span className="font-mono text-3xl font-semibold text-[#F1F5F9] tabular-nums">
              {latest && latest.bodyFatPercent > 0 ? latest.bodyFatPercent.toFixed(1) : '—'}
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#94A3B8]">%</span>
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-[#94A3B8]">
            {bfDelta !== null
              ? `${bfDelta > 0 ? '+' : ''}${bfDelta.toFixed(1)}% vs prior`
              : 'BIA smoothed'}
          </div>
        </div>

        <div className="border-t border-[#1E293B] p-5 lg:border-t-0">
          <div className="text-xs font-medium text-[#94A3B8]">Electrical Impedance</div>
          <div className="mt-2 flex items-baseline">
            <span className="font-mono text-3xl font-semibold text-[#F1F5F9] tabular-nums">
              {latest && latest.impedanceOhms > 0 ? latest.impedanceOhms : '—'}
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#94A3B8]">Ω</span>
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-[#94A3B8]">
            {latest && latest.leanMassKg > 0
              ? `Lean ${displayUnit === 'kg' ? latest.leanMassKg.toFixed(1) : (latest.leanMassKg * 2.20462).toFixed(1)} ${displayUnit}`
              : 'ITO footpad sensor'}
          </div>
        </div>

        <div className="border-t border-[#1E293B] p-5 lg:border-t-0">
          <div className="text-xs font-medium text-[#94A3B8]">Scale Battery & BMI</div>
          <div className="mt-2 flex items-baseline">
            <span className="font-mono text-3xl font-semibold text-[#F1F5F9] tabular-nums">
              {latest ? latest.batteryPercent : '—'}
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#94A3B8]">%</span>
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-[#94A3B8]">
            {latest && latest.bmi !== null ? `BMI ${latest.bmi.toFixed(1)}` : 'Height unconfigured'}
          </div>
        </div>

        <div className="border-t border-[#1E293B] p-5 lg:border-t-0">
          <div className="text-xs font-medium text-[#94A3B8]">Health Connect Queue</div>
          <div className="mt-2 flex items-baseline">
            <span className="font-mono text-3xl font-semibold text-[#06B6D4] tabular-nums">
              {state.healthConnect.queuedCount}
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#94A3B8]">pending</span>
          </div>
          <button
            type="button"
            onClick={onOpenHealthConnect}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#06B6D4] hover:text-[#22D3EE] cursor-pointer"
          >
            <span>Open Sync Hub</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Dual-Axis Telemetry Trend Chart */}
      <section className="border border-[#1E293B] bg-[#0F141F] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F9]">
              Weight & Bioimpedance Body Fat Trajectory
            </h2>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              Solid Cyan: Weight ({displayUnit}) · Dashed Amber: Body Fat (%) · Hover chart to inspect individual readings
            </p>
          </div>
          {activeHoverPoint && (
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-[#CBD5E1]">
              <span>{formatDateTime(activeHoverPoint.record.timestamp)}</span>
              <span className="text-[#06B6D4]">
                {formatWeight(activeHoverPoint.record, displayUnit)} {displayUnit}
              </span>
              <span className="text-[#F59E0B]">
                {activeHoverPoint.record.bodyFatPercent > 0
                  ? `${activeHoverPoint.record.bodyFatPercent.toFixed(1)}% BF`
                  : 'Guest'}
              </span>
              <span className="text-[#94A3B8]">
                {activeHoverPoint.record.impedanceOhms} Ω
              </span>
            </div>
          )}
        </div>

        {chartPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-[#94A3B8]">No weigh-in telemetry captured for this profile yet.</p>
            <button
              type="button"
              onClick={onOpenInjector}
              className="mt-4 rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] hover:bg-[#22D3EE] cursor-pointer"
            >
              Inject First Test Packet
            </button>
          </div>
        ) : (
          <div className="mt-4 w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}
              className="h-[270px] w-full min-w-[640px] cursor-crosshair select-none"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Horizontal reference gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = chartMetrics.padTop + t * chartMetrics.plotH;
                const wLabel = (chartMetrics.wMax - t * (chartMetrics.wMax - chartMetrics.wMin)).toFixed(1);
                const bfLabel = (chartMetrics.bfMax - t * (chartMetrics.bfMax - chartMetrics.bfMin)).toFixed(1);
                return (
                  <g key={t}>
                    <line
                      x1={chartMetrics.padLeft}
                      y1={y}
                      x2={chartMetrics.width - chartMetrics.padRight}
                      y2={y}
                      stroke="#1E293B"
                      strokeWidth="1"
                    />
                    <text
                      x={chartMetrics.padLeft - 10}
                      y={y + 4}
                      textAnchor="end"
                      fill="#94A3B8"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {wLabel}
                    </text>
                    <text
                      x={chartMetrics.width - chartMetrics.padRight + 10}
                      y={y + 4}
                      textAnchor="start"
                      fill="#94A3B8"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {bfLabel}%
                    </text>
                  </g>
                );
              })}

              {/* Primary Weight curve */}
              {weightPath && (
                <path
                  d={weightPath}
                  fill="none"
                  stroke="#06B6D4"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Secondary Body Fat curve (dashed) */}
              {bfPath && (
                <path
                  d={bfPath}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.75"
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                />
              )}

              {/* Hover crosshair line */}
              {activeHoverPoint && (
                <line
                  x1={activeHoverPoint.x}
                  y1={chartMetrics.padTop}
                  x2={activeHoverPoint.x}
                  y2={chartMetrics.height - chartMetrics.padBottom}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

              {/* Interactive Data Points & Invisible Hit Columns */}
              {chartMetrics.points.map((pt, idx) => {
                const isSelected = activeHoverPoint?.record.id === pt.record.id;
                const colWidth = Math.max(24, chartMetrics.plotW / Math.max(1, chartMetrics.points.length));
                return (
                  <g key={pt.record.id}>
                    <circle
                      cx={pt.x}
                      cy={pt.yWeight}
                      r={isSelected ? 4.5 : 3}
                      fill={isSelected ? '#22D3EE' : '#06B6D4'}
                      stroke="#07090E"
                      strokeWidth="1.5"
                    />
                    {pt.yBf !== null && (
                      <circle
                        cx={pt.x}
                        cy={pt.yBf}
                        r={isSelected ? 4 : 2.5}
                        fill="#F59E0B"
                        stroke="#07090E"
                        strokeWidth="1.5"
                      />
                    )}
                    {(idx === 0 ||
                      idx === chartMetrics.points.length - 1 ||
                      idx % Math.max(1, Math.ceil(chartMetrics.points.length / 6)) === 0) && (
                      <text
                        x={pt.x}
                        y={chartMetrics.height - 10}
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {formatShortDate(pt.record.timestamp)}
                      </text>
                    )}
                    <rect
                      x={pt.x - colWidth / 2}
                      y={chartMetrics.padTop}
                      width={colWidth}
                      height={chartMetrics.plotH}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(idx)}
                      onClick={() => onInspectPacket(pt.record.packetId)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      {/* High-Density Weigh-In Ledger */}
      <section className="border border-[#1E293B] bg-[#0F141F]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F9]">Captured Weigh-In Ledger</h2>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              {filteredWeighIns.length} decoded measurement(s) stored on local bridge host
            </p>
          </div>
        </div>

        {filteredWeighIns.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#94A3B8]">
            No weigh-ins match the selected household profile.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#1E293B] text-xs font-medium text-[#94A3B8]">
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3 text-right">Weight ({displayUnit})</th>
                  <th className="px-4 py-3 text-right">Body Fat</th>
                  <th className="px-4 py-3 text-right">Impedance</th>
                  <th className="px-4 py-3 text-right">BMI</th>
                  <th className="px-4 py-3">Sync State</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {filteredWeighIns.map((rec) => (
                  <tr
                    key={rec.id}
                    className="transition-colors hover:bg-[#141B29]"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[#CBD5E1] tabular-nums whitespace-nowrap">
                      {formatDateTime(rec.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#F1F5F9] whitespace-nowrap">
                      <span>{rec.profileName}</span>
                      <span className="ml-1.5 font-mono text-[#64748B]">· Slot {rec.userSlot}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-medium text-[#F1F5F9] tabular-nums">
                      {formatWeight(rec, displayUnit)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#CBD5E1] tabular-nums">
                      {rec.bodyFatPercent > 0 ? `${rec.bodyFatPercent.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#94A3B8] tabular-nums">
                      {rec.impedanceOhms > 0 ? `${rec.impedanceOhms} Ω` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#94A3B8] tabular-nums">
                      {rec.bmi !== null ? rec.bmi.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderSyncStatus(rec.syncStatus)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onInspectPacket(rec.packetId)}
                          className="rounded border border-[#1E293B] bg-[#07090E] px-2.5 py-1 text-xs text-[#CBD5E1] transition-colors hover:border-[#06B6D4] hover:text-[#F1F5F9] cursor-pointer"
                        >
                          Inspect 62B
                        </button>
                        {rec.syncStatus !== 'queued' && (
                          <button
                            type="button"
                            onClick={() => onRequeueWeighIn(rec.id)}
                            title="Re-queue for Health Connect"
                            className="rounded border border-[#1E293B] bg-[#07090E] p-1.5 text-[#94A3B8] transition-colors hover:border-[#06B6D4] hover:text-[#06B6D4] cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRequestDeleteWeighIn(rec)}
                          title="Delete weigh-in"
                          className="rounded border border-[#1E293B] bg-[#07090E] p-1.5 text-[#94A3B8] transition-colors hover:border-[#F43F5E] hover:text-[#F43F5E] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
