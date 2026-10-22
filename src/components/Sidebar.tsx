import React from 'react';
import { LayoutDashboard, ShieldAlert, Terminal, Palette } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isConnected: boolean;
  deviceName: string;
  mode: 'simulation' | 'webhid-readonly';
  onConnect: () => void;
  onSwitchToSimulator: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  deviceName,
  mode,
  onConnect,
  onSwitchToSimulator,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'rgb', label: 'RGB Lighting', icon: Palette },
    { id: 'backup', label: 'Backup & Recovery', icon: ShieldAlert },
    { id: 'logs', label: 'Diagnostics', icon: Terminal },
  ];

  return (
    <aside className="w-60 bg-[#070707] border-r border-[#181818] flex flex-col justify-between p-6 shrink-0 min-h-screen">
      <div className="space-y-8">
        {/* Top Logo - OpenMouse Style */}
        <div className="px-1 pt-1">
          <h1 className="font-bold text-lg text-white tracking-tight">
            Open <span className="text-[10px] text-zinc-600 font-mono font-normal ml-1">/ AULA</span>
          </h1>
        </div>

        {/* CONNECTED DEVICE Card */}
        <div className="space-y-2.5">
          <div className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase px-1 font-medium">
            DEVICE &amp; MODE
          </div>

          <div className="bg-[#121212] border border-[#222222] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  mode === 'webhid-readonly'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]'
                    : 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]'
                }`}
              />
              <span className="text-xs font-semibold text-white truncate">
                {deviceName}
              </span>
            </div>

            <div className="text-[10px] font-mono pl-4 text-zinc-400">
              {mode === 'webhid-readonly' ? (
                <span className="text-emerald-300">Read-Only Telemetry</span>
              ) : (
                <span className="text-cyan-300">Simulator (RAM Safe)</span>
              )}
            </div>

            <div className="pt-1 border-t border-[#1e1e1e] flex gap-2">
              {mode === 'simulation' ? (
                <button
                  onClick={onConnect}
                  className="w-full py-1.5 px-2 rounded-lg bg-[#1c1c1c] hover:bg-[#282828] text-zinc-200 hover:text-white text-[11px] font-semibold border border-[#2a2a2a] transition-all"
                >
                  Connect WebHID
                </button>
              ) : (
                <button
                  onClick={onSwitchToSimulator}
                  className="w-full py-1.5 px-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 text-[11px] font-semibold border border-cyan-500/30 transition-all"
                >
                  Return to Simulator
                </button>
              )}
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
        <p className="text-[10px] text-zinc-600 font-mono">Interface concept</p>
        <p className="text-xs text-zinc-400 hover:text-white cursor-pointer transition-colors">
          Back to website
        </p>
      </div>
    </aside>
  );
};
