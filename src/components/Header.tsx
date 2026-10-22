import React from 'react';

interface HeaderProps {
  isConnected: boolean;
  modifiedCount: number;
  mode?: 'simulation' | 'webhid-readonly';
}

export const Header: React.FC<HeaderProps> = ({ mode = 'simulation' }) => {
  return (
    <header className="px-10 pt-8 pb-6 flex items-start justify-between bg-[#0a0a0a]">
      <div className="space-y-1">
        <p className="text-[10px] font-mono tracking-[0.25em] text-zinc-500 uppercase font-semibold">
          Mech
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight text-white">
          AULA F75
        </h1>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#141414] border border-[#222222]">
          <div
            className={`w-2 h-2 rounded-full ${
              mode === 'webhid-readonly'
                ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]'
                : 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]'
            }`}
          />
          <span className="text-xs font-semibold text-zinc-300 font-mono">
            {mode === 'webhid-readonly' ? 'WebHID Read-Only' : 'Simulator Mode (RAM)'}
          </span>
        </div>
      </div>
    </header>
  );
};
