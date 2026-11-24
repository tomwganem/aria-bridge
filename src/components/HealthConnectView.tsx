import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Eye, EyeOff, RefreshCw, Smartphone } from 'lucide-react';
import {
  BridgeStatePayload,
  buildGoogleFitDatasetPayloads,
  buildHealthConnectRecord,
} from '../shared/ariaProtocol';
import {
  generateKotlinHealthConnectWorker,
  generateTaskerWorkflowRecipe,
} from '../lib/generators';

interface HealthConnectViewProps {
  state: BridgeStatePayload;
  onSimulateSync: () => Promise<void>;
  onRequestRotateToken: () => void;
  onRequestGoogleFitSync: (ids: string[]) => void;
  onRefreshState: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export const HealthConnectView: React.FC<HealthConnectViewProps> = ({
  state,
  onSimulateSync,
  onRequestRotateToken,
  onRequestGoogleFitSync,
  onRefreshState,
  onNotify,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [revealToken, setRevealToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [clientTab, setClientTab] = useState<'kotlin' | 'tasker' | 'google-fit'>('kotlin');

  const originUrl = useMemo(() => {
    if (state.config.bridgePublicUrl) return state.config.bridgePublicUrl.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return 'http://192.168.1.50:3000';
  }, [state.config.bridgePublicUrl]);

  const queuedWeighIns = useMemo(
    () => state.weighIns.filter((w) => w.syncStatus === 'queued'),
    [state.weighIns]
  );

  const hcEnvelopePreview = useMemo(() => {
    const sampleSource = queuedWeighIns.length > 0 ? queuedWeighIns.slice(0, 3) : state.weighIns.slice(0, 1);
    return {
      bridge: 'AriaBridge Lab',
      protocolVersion: 1,
      pendingCount: queuedWeighIns.length,
      records: sampleSource.map((w) => buildHealthConnectRecord(w)),
    };
  }, [queuedWeighIns, state.weighIns]);

  const googleFitPreview = useMemo(() => {
    const target = queuedWeighIns[0] ?? state.weighIns[0] ?? null;
    return target ? buildGoogleFitDatasetPayloads(target) : null;
  }, [queuedWeighIns, state.weighIns]);

  const kotlinCode = useMemo(() => generateKotlinHealthConnectWorker(originUrl), [originUrl]);
  const taskerRecipe = useMemo(() => generateTaskerWorkflowRecipe(originUrl), [originUrl]);

  useEffect(() => {
    const pairingPayload = JSON.stringify({
      bridge: 'AriaBridge Lab',
      bridgeUrl: originUrl,
      pendingEndpoint: `${originUrl}/api/health-connect/pending`,
      ackEndpoint: `${originUrl}/api/health-connect/ack`,
      pairingToken: state.healthConnect.pairingToken,
    });

    QRCode.toDataURL(pairingPayload, {
      width: 220,
      margin: 2,
      color: {
        dark: '#07090E',
        light: '#F1F5F9',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [originUrl, state.healthConnect.pairingToken]);

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const handleDownloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDownload = async (endpoint: string, filename: string, label: string) => {
    const res = await fetch(endpoint);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    await onRefreshState();
    onNotify(`Downloaded ${label}.`);
  };

  const handleRunSimulation = async () => {
    setSimulating(true);
    try {
      await onSimulateSync();
    } finally {
      setSimulating(false);
    }
  };

  const maskedToken = `${state.healthConnect.pairingToken.slice(0, 12)}••••••••••••••••`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F1F5F9]">Android Health Connect Sync Hub</h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Pull-queue bridge for Android Health Connect (WeightRecord + BodyFatRecord) with automatic Google Fit sync and CSV/JSON exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              handleExportDownload(
                '/api/export/health-connect-json',
                'ariabridge-health-connect.json',
                'Health Connect JSON bundle'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0F141F] px-3.5 py-2 text-xs font-medium text-[#F1F5F9] transition-colors hover:border-[#06B6D4] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Health Connect JSON</span>
          </button>
          <button
            type="button"
            onClick={() =>
              handleExportDownload(
                '/api/export/csv',
                'ariabridge-weigh-ins.csv',
                'weigh-in CSV export'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#0F141F] px-3.5 py-2 text-xs font-medium text-[#F1F5F9] transition-colors hover:border-[#06B6D4] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Top Split: QR Phone Pairing + Live Pull Queue */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Android Device Pairing Card */}
        <section className="flex flex-col justify-between border border-[#1E293B] bg-[#0F141F] p-5">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F9]">Pair Android Device</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">
              Scan this QR code from your Android companion worker or copy the bearer token into Tasker to pull queued Aria weigh-ins over Wi-Fi.
            </p>

            <div className="mt-4 flex justify-center border border-[#1E293B] bg-[#07090E] p-4">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Android Health Connect pairing QR code containing bridge URL and bearer token"
                  className="h-[196px] w-[196px]"
                />
              ) : (
                <div className="flex h-[196px] w-[196px] items-center justify-center font-mono text-xs text-[#64748B]">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <div className="text-[#94A3B8]">Pull Endpoint (GET)</div>
                <div className="mt-1 flex items-center justify-between gap-2 border border-[#1E293B] bg-[#07090E] px-2.5 py-2 font-mono text-[11px] text-[#CBD5E1]">
                  <span className="truncate">{originUrl}/api/health-connect/pending</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('pending-url', `${originUrl}/api/health-connect/pending`)}
                    className="text-[#94A3B8] hover:text-[#06B6D4] shrink-0 cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedKey === 'pending-url' ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[#94A3B8]">Acknowledge Endpoint (POST)</div>
                <div className="mt-1 flex items-center justify-between gap-2 border border-[#1E293B] bg-[#07090E] px-2.5 py-2 font-mono text-[11px] text-[#CBD5E1]">
                  <span className="truncate">{originUrl}/api/health-connect/ack</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('ack-url', `${originUrl}/api/health-connect/ack`)}
                    className="text-[#94A3B8] hover:text-[#06B6D4] shrink-0 cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedKey === 'ack-url' ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[#94A3B8]">
                  <span>Bearer Pairing Token</span>
                  <button
                    type="button"
                    onClick={onRequestRotateToken}
                    className="inline-flex items-center gap-1 text-[11px] text-[#F59E0B] hover:underline cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Rotate</span>
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 border border-[#1E293B] bg-[#07090E] px-2.5 py-2 font-mono text-[11px] text-[#F1F5F9]">
                  <span className="truncate">
                    {revealToken ? state.healthConnect.pairingToken : maskedToken}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRevealToken((r) => !r)}
                      className="text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
                      aria-label={revealToken ? 'Hide token' : 'Reveal token'}
                    >
                      {revealToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('token', state.healthConnect.pairingToken)}
                      className="text-[#94A3B8] hover:text-[#06B6D4] cursor-pointer"
                      aria-label="Copy pairing token"
                    >
                      {copiedKey === 'token' ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-[#1E293B] pt-3 font-mono text-[11px] text-[#94A3B8]">
            {state.healthConnect.lastPhoneSyncAt
              ? `Last Android Sync: ${new Date(state.healthConnect.lastPhoneSyncAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${state.healthConnect.lastPhoneDevice}`
              : 'No Android device sync recorded yet'}
          </div>
        </section>

        {/* Live Health Connect Pull-Queue & Simulator */}
        <section className="flex flex-col border border-[#1E293B] bg-[#0F141F]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F9]">
                Live Health Connect Record Queue
              </h2>
              <p className="mt-0.5 font-mono text-xs text-[#94A3B8] tabular-nums">
                {queuedWeighIns.length} queued · {state.healthConnect.syncedCount} synced · Deduplicated via clientRecordId
              </p>
            </div>

            <button
              type="button"
              disabled={simulating}
              onClick={handleRunSimulation}
              className="inline-flex items-center gap-2 rounded-md bg-[#06B6D4] px-4 py-2 text-xs font-medium text-[#07090E] transition-colors hover:bg-[#22D3EE] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>
                {simulating
                  ? 'Running Handshake...'
                  : queuedWeighIns.length > 0
                    ? `Test Android Sync (${queuedWeighIns.length})`
                    : 'Test Empty Queue Handshake'}
              </span>
            </button>
          </div>

          <div className="grid flex-1 grid-cols-1 divide-y divide-[#1E293B] xl:grid-cols-[260px_minmax(0,1fr)] xl:divide-x xl:divide-y-0">
            <div className="max-h-[420px] divide-y divide-[#1E293B] overflow-y-auto">
              {queuedWeighIns.length === 0 ? (
                <div className="p-5 text-xs leading-relaxed text-[#94A3B8]">
                  <div className="font-mono text-[#10B981]">● Queue Drained</div>
                  <p className="mt-2">
                    All eligible Aria weigh-ins have been acknowledged by Health Connect. Inject a new test packet or re-queue a historical reading in Overview to test another pull cycle.
                  </p>
                </div>
              ) : (
                queuedWeighIns.map((rec) => (
                  <div key={rec.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-[#F1F5F9] tabular-nums">
                        {rec.weightKg.toFixed(2)} kg
                      </span>
                      <span className="font-mono text-xs text-[#F59E0B]">▲ Queued</span>
                    </div>
                    <div className="mt-1 text-xs text-[#94A3B8]">
                      {rec.profileName} · {rec.bodyFatPercent > 0 ? `${rec.bodyFatPercent.toFixed(1)}% BF` : 'Weight Only'}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-[#64748B]">
                      {rec.clientRecordId}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col bg-[#07090E]">
              <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-2 font-mono text-[11px] text-[#94A3B8]">
                <span>GET /api/health-connect/pending — Canonical JSON Envelope</span>
                <span>WeightRecord + BodyFatRecord</span>
              </div>
              <pre className="max-h-[380px] flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-[#CBD5E1]">
                {JSON.stringify(hcEnvelopePreview, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      </div>

      {/* Android Client Kit Tabs (Kotlin Worker / Tasker / Google Fit) */}
      <section className="border border-[#1E293B] bg-[#0F141F]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-[#1E293B] bg-[#07090E] p-1">
            <button
              type="button"
              onClick={() => setClientTab('kotlin')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                clientTab === 'kotlin'
                  ? 'bg-[#141B29] text-[#06B6D4]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Kotlin Jetpack Health Connect
            </button>
            <button
              type="button"
              onClick={() => setClientTab('tasker')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                clientTab === 'tasker'
                  ? 'bg-[#141B29] text-[#06B6D4]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Zero-Code Tasker Workflow
            </button>
            <button
              type="button"
              onClick={() => setClientTab('google-fit')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                clientTab === 'google-fit'
                  ? 'bg-[#141B29] text-[#06B6D4]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Google Fit Sync & Legacy REST
            </button>
          </div>

          {clientTab === 'kotlin' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('kotlin', kotlinCode)}
                className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] cursor-pointer"
              >
                {copiedKey === 'kotlin' ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'kotlin' ? 'Copied' : 'Copy Kotlin'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadText('AriaHealthConnectWorker.kt', kotlinCode)}
                className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download .kt</span>
              </button>
            </div>
          )}

          {clientTab === 'tasker' && (
            <button
              type="button"
              onClick={() => handleCopy('tasker', taskerRecipe)}
              className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] cursor-pointer"
            >
              {copiedKey === 'tasker' ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === 'tasker' ? 'Copied' : 'Copy Recipe'}</span>
            </button>
          )}
        </div>

        {clientTab === 'kotlin' && (
          <pre className="max-h-[420px] overflow-auto bg-[#07090E] p-5 font-mono text-xs leading-relaxed text-[#CBD5E1]">
            {kotlinCode}
          </pre>
        )}

        {clientTab === 'tasker' && (
          <pre className="max-h-[420px] overflow-auto bg-[#07090E] p-5 font-mono text-xs leading-relaxed text-[#CBD5E1]">
            {taskerRecipe}
          </pre>
        )}

        {clientTab === 'google-fit' && (
          <div className="grid grid-cols-1 divide-y divide-[#1E293B] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold text-[#F1F5F9]">
                  Recommended: Automatic Google Fit Sync via Health Connect
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                  Google closed new Google Fit REST API sign-ups in May 2024 and is retiring legacy cloud endpoints by the end of 2026. Once your Aria weigh-ins land in Android Health Connect via this bridge:
                </p>
                <ol className="mt-3 space-y-2 text-xs text-[#CBD5E1]">
                  <li>1. Open the Google Fit app on your Android phone.</li>
                  <li>2. Go to Profile → Settings → Manage connected apps & Health Connect.</li>
                  <li>3. Enable <strong className="text-[#F1F5F9]">Sync Fit with Health Connect</strong> and allow Weight &amp; Body Fat read access.</li>
                  <li>4. Every Aria Gen 1 reading pulled into Health Connect appears automatically in Google Fit.</li>
                </ol>
              </div>

              <div className="border-t border-[#1E293B] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#F1F5F9]">
                    Optional: Legacy Google Fit REST API Proxy
                  </h3>
                  <span
                    className={`font-mono text-xs ${
                      state.googleFit.configured ? 'text-[#10B981]' : 'text-[#F59E0B]'
                    }`}
                  >
                    {state.googleFit.configured ? '● Server Token Configured' : '▲ Dry-Run Preview Mode'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
                  If you maintain an existing Google Fit OAuth token, set <code className="font-mono text-[#CBD5E1]">GOOGLE_FIT_ACCESS_TOKEN</code> in your server environment to dispatch live <code className="font-mono text-[#CBD5E1]">PATCH /fitness/v1/users/me/dataSources/.../datasets</code> calls. Without a token, clicking below validates the exact nanosecond payload in dry-run mode.
                </p>
                <button
                  type="button"
                  disabled={state.weighIns.length === 0}
                  onClick={() =>
                    onRequestGoogleFitSync(
                      (queuedWeighIns.length > 0 ? queuedWeighIns : state.weighIns.slice(0, 1)).map(
                        (w) => w.id
                      )
                    )
                  }
                  className="mt-4 rounded-md border border-[#1E293B] bg-[#141B29] px-4 py-2 text-xs font-medium text-[#F1F5F9] transition-colors hover:border-[#06B6D4] disabled:opacity-45 cursor-pointer"
                >
                  {state.googleFit.configured
                    ? `Push ${queuedWeighIns.length || 1} Record(s) to Google Fit REST`
                    : `Validate Legacy Google Fit PATCH Payload (Dry-Run)`}
                </button>
              </div>
            </div>

            <div className="bg-[#07090E] p-5">
              <div className="font-mono text-[11px] text-[#94A3B8]">
                Generated Nanosecond PATCH Payload (com.google.weight + com.google.body.fat.percentage)
              </div>
              <pre className="mt-3 max-h-[320px] overflow-auto font-mono text-xs leading-relaxed text-[#CBD5E1]">
                {googleFitPreview
                  ? JSON.stringify(googleFitPreview, null, 2)
                  : 'No weigh-ins available to preview.'}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* Sync Audit Log */}
      <section className="border border-[#1E293B] bg-[#0F141F]">
        <div className="border-b border-[#1E293B] px-5 py-3.5">
          <h2 className="text-base font-semibold text-[#F1F5F9]">Bridge Sync Audit Log</h2>
        </div>
        {state.syncLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#94A3B8]">No sync events logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] text-[#94A3B8]">
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Client / Device</th>
                  <th className="px-3 py-2.5 text-right">Records</th>
                  <th className="px-3 py-2.5">Outcome</th>
                  <th className="px-5 py-2.5">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {state.syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#141B29]">
                    <td className="px-5 py-2.5 font-mono text-[#94A3B8] tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[#CBD5E1] whitespace-nowrap">
                      {log.channel}
                    </td>
                    <td className="px-3 py-2.5 text-[#F1F5F9] whitespace-nowrap">
                      {log.deviceLabel}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#F1F5F9] tabular-nums">
                      {log.recordCount}
                    </td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      {log.status === 'ok' && <span className="text-[#10B981]">● OK</span>}
                      {log.status === 'dry_run' && <span className="text-[#F59E0B]">▲ Dry-Run</span>}
                      {log.status === 'error' && <span className="text-[#F43F5E]">✖ Error</span>}
                    </td>
                    <td className="px-5 py-2.5 text-[#94A3B8]">{log.detail}</td>
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
