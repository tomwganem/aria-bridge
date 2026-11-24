/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import {
  BridgeConfig,
  BridgeStatePayload,
  UserProfile,
  WeighInRecord,
} from './shared/ariaProtocol';
import { ActiveView, TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { PacketLabView } from './components/PacketLabView';
import { ScaleSetupView } from './components/ScaleSetupView';
import { HealthConnectView } from './components/HealthConnectView';
import { PacketInjectorModal } from './components/PacketInjectorModal';
import { ConfirmDialog } from './components/ConfirmDialog';

type PendingConfirm =
  | { kind: 'delete_weigh_in'; record: WeighInRecord }
  | { kind: 'rotate_token' }
  | { kind: 'google_fit_sync'; ids: string[] }
  | null;

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [state, setState] = useState<BridgeStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [injectorOpen, setInjectorOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PendingConfirm>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 3600);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as BridgeStatePayload;
      setState(data);
      setLoadError(null);
      setSelectedPacketId((prev) => prev ?? data.packets[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach local bridge server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleChangeUnit = async (unit: 'kg' | 'lb') => {
    if (!state) return;
    setState({ ...state, config: { ...state.config, displayUnit: unit } });
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayUnit: unit }),
    });
  };

  const handleSaveConfig = async (patch: Partial<BridgeConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await fetchState();
    }
  };

  const handleSaveProfile = async (profile: UserProfile) => {
    const res = await fetch(`/api/profiles/${profile.slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      await fetchState();
    }
  };

  const handleDeleteProfile = async (slot: number) => {
    const res = await fetch(`/api/profiles/${slot}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchState();
      notify(`Removed household profile slot ${slot}.`);
    }
  };

  const handleInspectPacket = (packetId: string) => {
    setSelectedPacketId(packetId);
    setActiveView('packet-lab');
  };

  const handleRequeueWeighIn = async (id: string) => {
    const res = await fetch(`/api/weigh-ins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncStatus: 'queued' }),
    });
    if (res.ok) {
      await fetchState();
      notify('Re-queued weigh-in for Android Health Connect.');
    }
  };

  const handleSimulateHealthConnectSync = async () => {
    const res = await fetch('/api/health-connect/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceLabel: 'Android Companion Simulator' }),
    });
    const data = await res.json();
    await fetchState();
    notify(data.message || 'Health Connect handshake completed.');
  };

  const handleConfirmExecute = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.kind === 'delete_weigh_in') {
        const res = await fetch(`/api/weigh-ins/${confirmAction.record.id}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          await fetchState();
          notify(`Deleted weigh-in (${confirmAction.record.weightKg.toFixed(2)} kg).`);
        }
      } else if (confirmAction.kind === 'rotate_token') {
        const res = await fetch('/api/health-connect/rotate-token', { method: 'POST' });
        if (res.ok) {
          await fetchState();
          notify('Rotated Android Health Connect pairing token. Re-scan QR on your phone.');
        }
      } else if (confirmAction.kind === 'google_fit_sync') {
        const res = await fetch('/api/sync/google-fit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weighInIds: confirmAction.ids }),
        });
        const data = await res.json();
        await fetchState();
        notify(data.message || `Synced ${data.syncedCount ?? 0} record(s) to Google Fit.`);
      }
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const handlePacketInjected = async (packetId: string) => {
    await fetchState();
    if (packetId) setSelectedPacketId(packetId);
    notify('Captured 62-byte Aria frame on /scale/upload and queued for Health Connect.');
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F1F5F9]">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenInjector={() => setInjectorOpen(true)}
      />

      <main className="mx-auto max-w-[1440px] px-6 py-7">
        {loading && !state ? (
          <div className="space-y-6">
            <div className="h-12 w-72 animate-pulse bg-[#0F141F]" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse border border-[#1E293B] bg-[#0F141F]" />
              ))}
            </div>
            <div className="h-72 animate-pulse border border-[#1E293B] bg-[#0F141F]" />
          </div>
        ) : loadError || !state ? (
          <div className="border border-[#1E293B] bg-[#0F141F] p-8 text-center">
            <h2 className="text-base font-semibold text-[#F1F5F9]">Bridge Server Unavailable</h2>
            <p className="mt-2 text-sm text-[#94A3B8]">
              {loadError || 'Unable to load local AriaBridge telemetry state.'}
            </p>
            <button
              type="button"
              onClick={fetchState}
              className="mt-4 rounded-md bg-[#06B6D4] px-4 py-2 text-sm font-medium text-[#07090E] hover:bg-[#22D3EE] cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {activeView === 'overview' && (
              <OverviewView
                state={state}
                displayUnit={state.config.displayUnit}
                onChangeUnit={handleChangeUnit}
                onInspectPacket={handleInspectPacket}
                onRequeueWeighIn={handleRequeueWeighIn}
                onRequestDeleteWeighIn={(record) =>
                  setConfirmAction({ kind: 'delete_weigh_in', record })
                }
                onOpenHealthConnect={() => setActiveView('health-connect')}
                onOpenInjector={() => setInjectorOpen(true)}
              />
            )}

            {activeView === 'packet-lab' && (
              <PacketLabView
                packets={state.packets}
                selectedPacketId={selectedPacketId}
                onSelectPacket={setSelectedPacketId}
                onHexPersisted={handlePacketInjected}
                onNotify={notify}
              />
            )}

            {activeView === 'scale-setup' && (
              <ScaleSetupView
                config={state.config}
                profiles={state.profiles}
                onSaveConfig={handleSaveConfig}
                onSaveProfile={handleSaveProfile}
                onDeleteProfile={handleDeleteProfile}
                onNotify={notify}
              />
            )}

            {activeView === 'health-connect' && (
              <HealthConnectView
                state={state}
                onSimulateSync={handleSimulateHealthConnectSync}
                onRequestRotateToken={() => setConfirmAction({ kind: 'rotate_token' })}
                onRequestGoogleFitSync={(ids) =>
                  setConfirmAction({ kind: 'google_fit_sync', ids })
                }
                onRefreshState={fetchState}
                onNotify={notify}
              />
            )}
          </>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-[1440px] border-t border-[#1E293B] px-6 py-5 text-xs text-[#64748B]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>AriaBridge Lab · Local Fitbit Aria Gen 1 Binary Bridge &amp; Android Health Connect Queue</span>
          <span className="font-mono">POST /scale/upload · GET /api/health-connect/pending</span>
        </div>
      </footer>

      {state && (
        <PacketInjectorModal
          open={injectorOpen}
          profiles={state.profiles}
          defaultMac={state.config.scaleMacAddress}
          onClose={() => setInjectorOpen(false)}
          onInjected={handlePacketInjected}
        />
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        busy={confirmBusy}
        destructive={confirmAction?.kind === 'delete_weigh_in' || confirmAction?.kind === 'rotate_token'}
        title={
          confirmAction?.kind === 'delete_weigh_in'
            ? 'Delete Weigh-In Record?'
            : confirmAction?.kind === 'rotate_token'
              ? 'Rotate Health Connect Pairing Token?'
              : 'Execute Google Fit REST Sync?'
        }
        description={
          confirmAction?.kind === 'delete_weigh_in'
            ? `Permanently delete the ${confirmAction.record.weightKg.toFixed(2)} kg reading for ${confirmAction.record.profileName} from the local bridge store? The raw binary capture remains in Packet Lab.`
            : confirmAction?.kind === 'rotate_token'
              ? 'Generating a new pairing bearer token immediately revokes the previous token. Any paired Android companion worker or Tasker flow will need the new QR code or token.'
              : state?.googleFit.configured
                ? `Send ${confirmAction?.ids.length ?? 0} weigh-in record(s) via PATCH to Google Fit REST API (com.google.weight and com.google.body.fat.percentage)?`
                : `Run a server-side dry-run validation for ${confirmAction?.ids.length ?? 0} weigh-in record(s) against the Google Fit nanosecond dataset schema?`
        }
        confirmLabel={
          confirmAction?.kind === 'delete_weigh_in'
            ? 'Delete Record'
            : confirmAction?.kind === 'rotate_token'
              ? 'Rotate Token'
              : state?.googleFit.configured
                ? 'Push to Google Fit'
                : 'Run Dry-Run Check'
        }
        onConfirm={handleConfirmExecute}
        onCancel={() => setConfirmAction(null)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 bottom-6 z-50 max-w-md border border-[#06B6D4]/50 bg-[#0F141F] px-4 py-3 text-xs text-[#F1F5F9] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
