import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Plus, Trash2 } from 'lucide-react';
import { BridgeConfig, UserProfile } from '../shared/ariaProtocol';
import { generateDnsmasqConfig, generateLanRelayScript } from '../lib/generators';

interface ScaleSetupViewProps {
  config: BridgeConfig;
  profiles: UserProfile[];
  onSaveConfig: (patch: Partial<BridgeConfig>) => Promise<void>;
  onSaveProfile: (profile: UserProfile) => Promise<void>;
  onDeleteProfile: (slot: number) => Promise<void>;
  onNotify: (msg: string) => void;
}

const SCALE_HARDWARE_IMAGE = '/src/assets/images/aria_scale_hardware_1795505540848.jpg';

export const ScaleSetupView: React.FC<ScaleSetupViewProps> = ({
  config,
  profiles,
  onSaveConfig,
  onSaveProfile,
  onDeleteProfile,
  onNotify,
}) => {
  const [lanBridgeIp, setLanBridgeIp] = useState(config.lanBridgeIp);
  const [lanRelayPort, setLanRelayPort] = useState(config.lanRelayPort);
  const [bridgePublicUrl, setBridgePublicUrl] = useState(config.bridgePublicUrl);
  const [enableProxyReplay, setEnableProxyReplay] = useState(config.enableProxyReplay);
  const [fitbitUpstreamIp, setFitbitUpstreamIp] = useState(config.fitbitUpstreamIp);
  const [savingConfig, setSavingConfig] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState<'dns' | 'relay'>('dns');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Profile editor state
  const [editingSlot, setEditingSlot] = useState<number>(
    profiles.find((p) => p.slot === 1)?.slot ?? 1
  );
  const [profName, setProfName] = useState(
    profiles.find((p) => p.slot === 1)?.name ?? 'New Member'
  );
  const [profHeight, setProfHeight] = useState(
    profiles.find((p) => p.slot === 1)?.heightCm ?? 175
  );
  const [profMinKg, setProfMinKg] = useState(
    profiles.find((p) => p.slot === 1)?.minWeightKg ?? 60
  );
  const [profMaxKg, setProfMaxKg] = useState(
    profiles.find((p) => p.slot === 1)?.maxWeightKg ?? 85
  );
  const [profAutoQueue, setProfAutoQueue] = useState(
    profiles.find((p) => p.slot === 1)?.autoQueueHealthConnect ?? true
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const liveConfig: BridgeConfig = useMemo(
    () => ({
      ...config,
      lanBridgeIp,
      lanRelayPort,
      bridgePublicUrl,
      enableProxyReplay,
      fitbitUpstreamIp,
    }),
    [config, lanBridgeIp, lanRelayPort, bridgePublicUrl, enableProxyReplay, fitbitUpstreamIp]
  );

  const dnsConfigText = useMemo(() => generateDnsmasqConfig(liveConfig), [liveConfig]);
  const relayScriptText = useMemo(() => generateLanRelayScript(liveConfig), [liveConfig]);

  const handleApplyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await onSaveConfig({
        lanBridgeIp,
        lanRelayPort,
        bridgePublicUrl,
        enableProxyReplay,
        fitbitUpstreamIp,
      });
      onNotify('Saved LAN DNS & relay configuration to local host store.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectProfileToEdit = (p: UserProfile) => {
    setEditingSlot(p.slot);
    setProfName(p.name);
    setProfHeight(p.heightCm);
    setProfMinKg(p.minWeightKg);
    setProfMaxKg(p.maxWeightKg);
    setProfAutoQueue(p.autoQueueHealthConnect);
  };

  const startNewProfileSlot = () => {
    const usedSlots = new Set(profiles.map((p) => p.slot));
    const nextSlot = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !usedSlots.has(s)) ?? 3;
    setEditingSlot(nextSlot);
    setProfName(`Household Slot ${nextSlot}`);
    setProfHeight(172);
    setProfMinKg(55);
    setProfMaxKg(80);
    setProfAutoQueue(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onSaveProfile({
        slot: editingSlot,
        name: profName.trim(),
        heightCm: Number(profHeight) || 0,
        minWeightKg: Number(profMinKg) || 0,
        maxWeightKg: Number(profMaxKg) || 200,
        preferredUnit: config.displayUnit,
        autoQueueHealthConnect: profAutoQueue,
      });
      onNotify(`Saved Aria user slot ${editingSlot} (${profName.trim()}).`);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E293B] pb-4">
        <h1 className="text-2xl font-semibold text-[#F1F5F9]">Fitbit Aria Gen 1 Setup & LAN Pairing</h1>
        <p className="mt-1 text-xs text-[#94A3B8]">
          Route hardcoded HTTP POST /scale/upload traffic from your home Wi-Fi to AriaBridge Lab and map scale user slots
        </p>
      </div>

      {/* Top Row: Hardware Reference + Pairing Architecture */}
      <section className="grid grid-cols-1 items-stretch border border-[#1E293B] bg-[#0F141F] lg:grid-cols-[400px_1fr]">
        <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden border-b border-[#1E293B] bg-[#07090E] lg:border-r lg:border-b-0">
          {!imgFailed ? (
            <img
              src={SCALE_HARDWARE_IMAGE}
              alt="Fitbit Aria Gen 1 black tempered-glass Wi-Fi smart scale on a dark laboratory workbench"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <svg viewBox="0 0 120 120" className="h-24 w-24 text-[#06B6D4]" fill="none">
                <rect x="14" y="14" width="92" height="92" rx="14" stroke="currentColor" strokeWidth="2" />
                <line x1="60" y1="14" x2="60" y2="106" stroke="#1E293B" strokeWidth="2" />
                <line x1="14" y1="60" x2="106" y2="60" stroke="#1E293B" strokeWidth="2" />
                <circle cx="60" cy="40" r="14" fill="#0F141F" stroke="currentColor" strokeWidth="2" />
              </svg>
              <p className="mt-3 font-mono text-xs text-[#94A3B8]">Fitbit Aria (Gen 1) · 802.11b/g Wi-Fi</p>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between p-6">
          <div>
            <h2 className="text-lg font-semibold text-[#F1F5F9]">How Aria Gen 1 Pairs With Your Local Service</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
              Unlike modern Bluetooth-only scales, the original Fitbit Aria (Gen 1) connects to 2.4 GHz Wi-Fi (802.11b/g) and sends unencrypted little-endian 62-byte binary frames via HTTP POST to{' '}
              <code className="font-mono text-[#CBD5E1]">http://www.fitbit.com/scale/upload</code> on port 80.
            </p>

            <ol className="mt-4 space-y-2.5 text-sm text-[#CBD5E1]">
              <li className="flex gap-3">
                <span className="font-mono text-xs text-[#06B6D4]">01.</span>
                <span>
                  Put the scale in setup mode (remove one AA battery for 10 seconds, reinsert to broadcast the{' '}
                  <code className="font-mono text-xs text-[#F1F5F9]">Aria-XXXX</code> Wi-Fi AP) and connect it to your 2.4 GHz SSID if not already joined.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-xs text-[#06B6D4]">02.</span>
                <span>
                  Add the local DNS rule below in Pi-hole, AdGuard Home, or your router&apos;s <code className="font-mono text-xs text-[#F1F5F9]">dnsmasq</code> so{' '}
                  <code className="font-mono text-xs text-[#F1F5F9]">www.fitbit.com</code> resolves to your LAN relay IP.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-xs text-[#06B6D4]">03.</span>
                <span>
                  Run the generated <code className="font-mono text-xs text-[#F1F5F9]">aria-lan-relay.mjs</code> script on port 80. It forwards the raw 62-byte frame to AriaBridge Lab and sends back our 16-byte HTTP 200 ACK so the scale displays a checkmark.
                </span>
              </li>
            </ol>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#1E293B] pt-4 font-mono text-xs sm:grid-cols-4">
            <div>
              <div className="text-[#64748B]">Transport</div>
              <div className="mt-1 text-[#F1F5F9]">HTTP/1.1 Port 80</div>
            </div>
            <div>
              <div className="text-[#64748B]">Endpoint</div>
              <div className="mt-1 text-[#F1F5F9]">POST /scale/upload</div>
            </div>
            <div>
              <div className="text-[#64748B]">Frame Size</div>
              <div className="mt-1 text-[#F1F5F9]">62 Bytes (LE)</div>
            </div>
            <div>
              <div className="text-[#64748B]">Active MAC</div>
              <div className="mt-1 text-[#06B6D4]">{config.scaleMacAddress}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Network Configurator + Generated DNS / Relay Scripts */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={handleApplyConfig} className="space-y-4 border border-[#1E293B] bg-[#0F141F] p-5">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F9]">LAN Bridge Parameters</h2>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              Changes update the generated DNS rules and port-80 relay script live.
            </p>
          </div>

          <div>
            <label htmlFor="cfg-lan-ip" className="block text-xs font-medium text-[#94A3B8]">
              LAN Relay Host IP (Raspberry Pi / Server)
            </label>
            <input
              id="cfg-lan-ip"
              type="text"
              value={lanBridgeIp}
              onChange={(e) => setLanBridgeIp(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="cfg-port" className="block text-xs font-medium text-[#94A3B8]">
              Relay Listen Port (Aria expects 80)
            </label>
            <input
              id="cfg-port"
              type="number"
              min="1"
              max="65535"
              value={lanRelayPort}
              onChange={(e) => setLanRelayPort(Number(e.target.value))}
              className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] tabular-nums focus:border-[#06B6D4] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="cfg-url" className="block text-xs font-medium text-[#94A3B8]">
              AriaBridge Lab Forward URL
            </label>
            <input
              id="cfg-url"
              type="text"
              value={bridgePublicUrl}
              onChange={(e) => setBridgePublicUrl(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-xs text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
            />
          </div>

          <div className="border-t border-[#1E293B] pt-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableProxyReplay}
                onChange={(e) => setEnableProxyReplay(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#06B6D4]"
              />
              <span className="text-xs leading-relaxed text-[#CBD5E1]">
                Enable Proxy-and-Replay (clone raw frame to legacy upstream IP after local capture)
              </span>
            </label>
            {enableProxyReplay && (
              <div className="mt-3">
                <label htmlFor="cfg-upstream" className="block text-xs font-medium text-[#94A3B8]">
                  Upstream Target IP
                </label>
                <input
                  id="cfg-upstream"
                  type="text"
                  value={fitbitUpstreamIp}
                  onChange={(e) => setFitbitUpstreamIp(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#1E293B] bg-[#07090E] px-3 py-1.5 font-mono text-xs text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={savingConfig}
            className="w-full rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] transition-colors hover:bg-[#22D3EE] disabled:opacity-50 cursor-pointer"
          >
            {savingConfig ? 'Saving...' : 'Save Bridge Config'}
          </button>
        </form>

        {/* Generated Artifacts Viewer */}
        <div className="flex flex-col border border-[#1E293B] bg-[#0F141F]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-3.5">
            <div className="flex items-center gap-1 rounded-md border border-[#1E293B] bg-[#07090E] p-1">
              <button
                type="button"
                onClick={() => setActiveSnippet('dns')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSnippet === 'dns'
                    ? 'bg-[#141B29] text-[#06B6D4]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                Pi-hole / dnsmasq Config
              </button>
              <button
                type="button"
                onClick={() => setActiveSnippet('relay')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSnippet === 'relay'
                    ? 'bg-[#141B29] text-[#06B6D4]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                Port-{lanRelayPort} LAN Relay Script (.mjs)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    activeSnippet,
                    activeSnippet === 'dns' ? dnsConfigText : relayScriptText
                  )
                }
                className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] hover:text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedId === activeSnippet ? (
                  <Check className="h-3.5 w-3.5 text-[#10B981]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedId === activeSnippet ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadFile(
                    activeSnippet === 'dns' ? '09-aria-bridge.conf' : 'aria-lan-relay.mjs',
                    activeSnippet === 'dns' ? dnsConfigText : relayScriptText
                  )
                }
                className="inline-flex items-center gap-1.5 rounded border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] hover:text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <pre className="max-h-[380px] flex-1 overflow-auto bg-[#07090E] p-5 font-mono text-xs leading-relaxed text-[#CBD5E1]">
            {activeSnippet === 'dns' ? dnsConfigText : relayScriptText}
          </pre>
        </div>
      </section>

      {/* Household User Slot Mapper */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="border border-[#1E293B] bg-[#0F141F]">
          <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F9]">Household User Slot Mapping</h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Maps Aria&apos;s offset 0x1D slot byte (plus weight tolerance fallback) to household members and BMI calculation
              </p>
            </div>
            <button
              type="button"
              onClick={startNewProfileSlot}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#141B29] px-3 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#06B6D4] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Slot</span>
            </button>
          </div>

          <div className="divide-y divide-[#1E293B]">
            {profiles.map((p) => {
              const isEditing = p.slot === editingSlot;
              return (
                <div
                  key={p.slot}
                  className={`flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 transition-colors ${
                    isEditing ? 'bg-[#141B29]' : 'hover:bg-[#141B29]/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-[#F1F5F9]">
                      <span className="font-mono text-xs text-[#06B6D4]">Slot {p.slot}</span>
                      <span>{p.name}</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-[#94A3B8] tabular-nums">
                      Height {p.heightCm > 0 ? `${p.heightCm} cm` : 'N/A'} · Weight Band{' '}
                      {p.minWeightKg}–{p.maxWeightKg} kg ·{' '}
                      {p.autoQueueHealthConnect ? 'Auto-queue Health Connect' : 'Local Only'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectProfileToEdit(p)}
                      className="rounded border border-[#1E293B] bg-[#07090E] px-3 py-1.5 text-xs text-[#CBD5E1] hover:border-[#06B6D4] hover:text-[#F1F5F9] cursor-pointer"
                    >
                      Edit
                    </button>
                    {p.slot !== 0 && (
                      <button
                        type="button"
                        onClick={() => onDeleteProfile(p.slot)}
                        title="Remove slot"
                        className="rounded border border-[#1E293B] bg-[#07090E] p-1.5 text-[#94A3B8] hover:border-[#F43F5E] hover:text-[#F43F5E] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4 border border-[#1E293B] bg-[#0F141F] p-5">
          <h3 className="text-base font-semibold text-[#F1F5F9]">
            Edit Slot {editingSlot}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prof-slot" className="block text-xs text-[#94A3B8]">
                Aria Slot (0–8)
              </label>
              <input
                id="prof-slot"
                type="number"
                min="0"
                max="8"
                value={editingSlot}
                onChange={(e) => setEditingSlot(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="prof-height" className="block text-xs text-[#94A3B8]">
                Height (cm)
              </label>
              <input
                id="prof-height"
                type="number"
                min="0"
                max="240"
                value={profHeight}
                onChange={(e) => setProfHeight(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="prof-name" className="block text-xs text-[#94A3B8]">
              Member Name
            </label>
            <input
              id="prof-name"
              type="text"
              required
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
              className="mt-1 w-full rounded border border-[#1E293B] bg-[#07090E] px-3 py-2 text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prof-min" className="block text-xs text-[#94A3B8]">
                Min Weight (kg)
              </label>
              <input
                id="prof-min"
                type="number"
                min="0"
                max="300"
                value={profMinKg}
                onChange={(e) => setProfMinKg(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="prof-max" className="block text-xs text-[#94A3B8]">
                Max Weight (kg)
              </label>
              <input
                id="prof-max"
                type="number"
                min="0"
                max="350"
                value={profMaxKg}
                onChange={(e) => setProfMaxKg(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[#1E293B] bg-[#07090E] px-3 py-2 font-mono text-sm text-[#F1F5F9] focus:border-[#06B6D4] focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#CBD5E1] cursor-pointer">
            <input
              type="checkbox"
              checked={profAutoQueue}
              onChange={(e) => setProfAutoQueue(e.target.checked)}
              className="h-4 w-4 accent-[#06B6D4]"
            />
            <span>Automatically queue weigh-ins for Android Health Connect</span>
          </label>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] hover:bg-[#22D3EE] disabled:opacity-50 cursor-pointer"
          >
            {savingProfile ? 'Saving...' : 'Save Profile Mapping'}
          </button>
        </form>
      </section>
    </div>
  );
};
