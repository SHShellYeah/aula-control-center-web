import React from 'react';
import { Shield, Usb, LogOut, CheckCircle2, AlertCircle, RefreshCw, ArrowDownToLine } from 'lucide-react';
import type { DeviceTelemetry } from '../services/webhid';

interface OverviewProps {
  isConnected: boolean;
  modifiedCount: number;
  mode?: 'simulation' | 'webhid-readonly';
  activeProfileName?: string;
  keyboardElement: React.ReactNode;
  onNavigateToProfiles?: () => void;
  onConnect?: () => void;
  onSwitchToSimulator?: () => void;
  onReadIdentity?: () => void;
  onReadKeymap?: () => void;
  onImportDeviceKeymap?: () => void;
  deviceTelemetry?: DeviceTelemetry;
}

export const Overview: React.FC<OverviewProps> = ({
  modifiedCount,
  mode = 'simulation',
  activeProfileName = 'Factory Default ANSI',
  keyboardElement,
  onNavigateToProfiles,
  onConnect,
  onSwitchToSimulator,
  onReadIdentity,
  onReadKeymap,
  onImportDeviceKeymap,
  deviceTelemetry,
}) => {
  const isHardware = mode === 'webhid-readonly';

  return (
    <div className="space-y-6">
      {/* Top Hero Layout - Split (Left Hero Canvas / Right Stat Stack) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Hero Canvas (66% Width) */}
        <div className="lg:col-span-2 bg-[#111111] border border-[#222222] rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[420px]">
          {/* Orbital Grid Rings Background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="orbit-ring-1 flex items-center justify-center">
              <div className="orbit-ring-2" />
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase font-medium">
                {isHardware ? 'WIRED TELEMETRY & SIMULATOR' : 'SIMULATED MATRIX VIEW'}
              </span>
              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                  isHardware
                    ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800/60'
                    : 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50'
                }`}
              >
                {isHardware ? 'Read-Only Hardware Active' : 'Simulator Mode'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isHardware ? (
                <button
                  onClick={onSwitchToSimulator}
                  className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#262626] border border-[#333333] text-zinc-300 hover:text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                  title="Disconnect physical hardware and revert to in-memory simulator."
                >
                  <LogOut className="w-3.5 h-3.5 text-zinc-400" />
                  Disconnect to Simulator
                </button>
              ) : (
                <button
                  onClick={onConnect}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 hover:text-emerald-200 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                  title="Connect physical wired AULA F75 (VID 0x258A, PID 0x010C) via WebHID chooser."
                >
                  <Usb className="w-3.5 h-3.5 text-emerald-400" />
                  Connect Wired F75
                </button>
              )}
            </div>
          </div>

          {/* Centered Keyboard View */}
          <div className="relative z-10 my-auto py-4">
            {keyboardElement}
          </div>

          <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            <span>
              {isHardware
                ? 'Displaying: Active Simulator Profile in RAM (Hardware Read-Only)'
                : 'Displaying: Virtual RAM Matrix'}
            </span>
            <span>AULA F75 (VID 0x258A, PID 0x010C)</span>
          </div>
        </div>

        {/* Right Stat Cards Stack (33% Width) */}
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 flex flex-col justify-between space-y-6">
          {/* Card 1: KEYBOARD LAYOUT */}
          <div className="space-y-1 border-b border-[#1f1f1f] pb-5">
            <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-medium">
              KEYBOARD LAYOUT
            </div>
            <div className="text-3xl font-extrabold text-white">75% ANSI</div>
            <div className="text-[11px] text-zinc-500 mt-1">
              80 Physical Key Caps + Rotary Volume Knob
            </div>
          </div>

          {/* Card 2: ACTIVE PROFILE */}
          <div className="space-y-1 border-b border-[#1f1f1f] pb-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-medium">
                ACTIVE PROFILE
              </div>
              {onNavigateToProfiles && (
                <button
                  onClick={onNavigateToProfiles}
                  className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline"
                >
                  Manage Profiles →
                </button>
              )}
            </div>
            <div className="text-xl font-extrabold text-white truncate">{activeProfileName}</div>
            <div className="text-[11px] text-zinc-500">
              {modifiedCount > 0 ? `${modifiedCount} custom remapped key(s)` : 'Stock factory mapping active'}
            </div>
          </div>

          {/* Card 3: CONNECTION & SAFETY */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-medium">
              SAFETY MODE
            </div>
            <div
              className={`text-xl font-extrabold ${
                isHardware ? 'text-emerald-400' : 'text-cyan-400'
              }`}
            >
              {isHardware ? 'Wired Read-Only Mode' : 'In-Memory Simulator'}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              {isHardware
                ? 'Guarded WebHID pipe active. Writes strictly blocked.'
                : '100% RAM Virtual Device (Zero Hardware Risk)'}
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Read-Only Telemetry Controls (Visible when hardware is connected) */}
      {isHardware && (
        <div className="bg-[#111111] border border-emerald-500/30 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#1f1f1f]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase font-semibold">
                  HARDWARE TELEMETRY CONTROLS
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  VID 0x258A : PID 0x010C
                </span>
              </div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Usb className="w-4 h-4 text-emerald-400" />
                Reviewed Read-Only Hardware Queries
              </h3>
              <p className="text-xs text-zinc-400">
                Execute approved, non-mutating queries over the USB vendor feature report pipe (Report ID 6). All writes remain disabled.
              </p>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs font-mono">
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              Flash Writes Disabled
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Query 1: Device Identity (CMD 0x82) */}
            <div className="bg-[#141414] border border-[#242424] rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Device Identity Query (CMD 0x82)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f1f] text-zinc-300">
                    Non-Mutating Read
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Retrieves the 14-byte ASCII model / firmware string from the keyboard controller. Handles Linux 14-byte short buffer safely.
                </p>
              </div>

              <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-500 uppercase">Hardware Response:</div>
                <div className="flex items-center gap-2">
                  {deviceTelemetry?.identityQueryStatus === 'reading' && (
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  )}
                  {deviceTelemetry?.identityQueryStatus === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {deviceTelemetry?.identityQueryStatus === 'error' && (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-xs font-mono font-bold text-white truncate">
                    {deviceTelemetry?.modelString ? `"${deviceTelemetry.modelString}"` : 'Not queried yet'}
                  </span>
                </div>
                {deviceTelemetry?.lastIdentityQueryAt && (
                  <div className="text-[10px] font-mono text-zinc-500">
                    Last read: {deviceTelemetry.lastIdentityQueryAt}
                  </div>
                )}
              </div>

              <button
                onClick={onReadIdentity}
                disabled={deviceTelemetry?.identityQueryStatus === 'reading'}
                className="w-full py-2 px-3 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-xs font-semibold text-white border border-[#333333] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${deviceTelemetry?.identityQueryStatus === 'reading' ? 'animate-spin' : ''}`} />
                {deviceTelemetry?.modelString ? 'Re-Query Device Identity (0x82)' : 'Execute Query CMD 0x82'}
              </button>
            </div>

            {/* Query 2: Keymap Layer 0 (CMD 0x83) */}
            <div className="bg-[#141414] border border-[#242424] rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Keymap Readback (CMD 0x83)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f1f] text-zinc-300">
                    Non-Mutating Read
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Reads back the 512-byte Table 0 keymap from physical hardware. Validates layer size and Esc/Fn/Sentinel integrity.
                </p>
              </div>

              <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-500 uppercase">Hardware Keymap State:</div>
                <div className="flex items-center gap-2">
                  {deviceTelemetry?.keymapQueryStatus === 'reading' && (
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  )}
                  {deviceTelemetry?.keymapQueryStatus === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {deviceTelemetry?.keymapQueryStatus === 'error' && (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-xs font-mono font-bold text-white truncate">
                    {deviceTelemetry?.keymapLayer0
                      ? '512 bytes read & verified'
                      : 'Not read yet'}
                  </span>
                </div>
                {deviceTelemetry?.lastKeymapQueryAt && (
                  <div className="text-[10px] font-mono text-zinc-500">
                    Last read: {deviceTelemetry.lastKeymapQueryAt}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onReadKeymap}
                  disabled={deviceTelemetry?.keymapQueryStatus === 'reading'}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-xs font-semibold text-white border border-[#333333] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${deviceTelemetry?.keymapQueryStatus === 'reading' ? 'animate-spin' : ''}`} />
                  {deviceTelemetry?.keymapLayer0 ? 'Re-Read Keymap (0x83)' : 'Read Keymap CMD 0x83'}
                </button>

                {deviceTelemetry?.keymapLayer0 && (
                  <button
                    onClick={onImportDeviceKeymap}
                    title="Load hardware keymap telemetry into the active simulator profile in RAM to test remappings virtually."
                    className="py-2 px-3 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-800/60 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
                    Import to Simulator
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
