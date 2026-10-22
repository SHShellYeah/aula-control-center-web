import React from 'react';
import { LayoutDashboard, ShieldAlert, Terminal, Palette, Sliders, Shield } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isConnected: boolean;
  deviceName: string;
  mode: 'simulation' | 'webhid-readonly';
  onConnect?: () => void;
  onSwitchToSimulator?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  deviceName,
  mode,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'profiles', label: 'Profiles', icon: Sliders },
    { id: 'rgb', label: 'RGB Lighting', icon: Palette },
    { id: 'backup', label: 'Backup & Recovery', icon: ShieldAlert },
    { id: 'logs', label: 'Diagnostics', icon: Terminal },
  ];

  return (
    <aside className="w-60 bg-[#070707] border-r border-[#181818] flex flex-col justify-between p-6 shrink-0 min-h-screen">
      <div className="space-y-8">
        {/* Top Logo */}
        <div className="px-1 pt-1">
          <h1 className="font-bold text-lg text-white tracking-tight flex items-baseline gap-1">
            AULA <span className="text-[10px] text-zinc-500 font-mono font-normal">Control Center</span>
          </h1>
        </div>

        {/* DEVICE & MODE Card */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase px-1 font-medium">
            DEVICE &amp; MODE
          </div>

          <div className="bg-[#121212] border border-[#222222] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
              <span className="text-xs font-semibold text-white truncate">
                {deviceName}
              </span>
            </div>

            <div className="text-[10px] font-mono pl-4 text-cyan-300">
              {mode === 'webhid-readonly' ? 'Read-Only Telemetry' : 'Simulator (RAM Safe)'}
            </div>

            <div className="pt-2 border-t border-[#1e1e1e]">
              <button
                disabled
                title="Physical hardware connections are deliberately disabled in Milestone 1 (Simulator-Only Mode) to protect keyboard flash."
                className="w-full py-1.5 px-2 rounded-lg bg-[#181818] text-zinc-500 text-[10px] font-semibold border border-[#262626] cursor-not-allowed opacity-75 flex items-center justify-center gap-1.5"
              >
                <Shield className="w-3 h-3 text-zinc-500" />
                Hardware Disabled (M1)
              </button>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs transition-all flex items-center gap-2.5 group ${
                  isActive
                    ? 'bg-[#1a1a1a] text-white font-semibold border border-[#2a2a2a] shadow-sm'
                    : 'text-zinc-400 hover:text-white font-medium hover:bg-[#121212]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Info */}
      <div className="space-y-1 pt-6 px-1 border-t border-[#141414]">
        <p className="text-[10px] text-zinc-500 font-mono">Milestone 1: Simulator Only</p>
        <p className="text-[11px] text-zinc-400 font-mono">Zero hardware writes</p>
      </div>
    </aside>
  );
};
