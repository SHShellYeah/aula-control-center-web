import React from 'react';
import { Shield } from 'lucide-react';

interface OverviewProps {
  isConnected: boolean;
  modifiedCount: number;
  mode?: 'simulation' | 'webhid-readonly';
  activeProfileName?: string;
  keyboardElement: React.ReactNode;
  onNavigateToProfiles?: () => void;
}

export const Overview: React.FC<OverviewProps> = ({
  modifiedCount,
  activeProfileName = 'Factory Default ANSI',
  keyboardElement,
  onNavigateToProfiles,
}) => {
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

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-medium">
              SIMULATED MATRIX VIEW
            </span>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2.5 py-1 rounded-full">
                Simulator Mode
              </span>
              <button
                disabled
                title="Physical hardware operations are deliberately disabled in Milestone 1 to protect device memory."
                className="px-3.5 py-1.5 rounded-lg bg-[#181818] border border-[#2a2a2a] text-zinc-500 font-bold text-xs cursor-not-allowed opacity-75 flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                Hardware Disabled (M1)
              </button>
            </div>
          </div>

          {/* Centered Keyboard View */}
          <div className="relative z-10 my-auto py-4">
            {keyboardElement}
          </div>

          <div className="relative z-10 text-right">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              AULA F75
            </span>
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

          {/* Card 3: CONNECTION */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-medium">
              SAFETY MODE
            </div>
            <div className="text-xl font-extrabold text-cyan-400">
              In-Memory Simulator
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              100% RAM Virtual Device (Zero Hardware Risk)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
