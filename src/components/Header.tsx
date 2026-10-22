import React from 'react';

interface HeaderProps {
  isConnected: boolean;
  modifiedCount: number;
  mode?: 'simulation' | 'webhid-readonly';
  activeProfileName?: string;
  hasUnsavedChanges?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  mode = 'simulation',
  activeProfileName,
  hasUnsavedChanges = false,
}) => {
  return (
    <header className="px-10 pt-8 pb-6 flex items-start justify-between bg-[#0a0a0a]">
      <div className="space-y-1">
        <p className="text-[10px] font-mono tracking-[0.25em] text-zinc-500 uppercase font-semibold">
          AULA Control Center Web
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-white">
          AULA F75
        </h1>
      </div>

      <div className="flex items-center gap-3 pt-2">
        {activeProfileName && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121212] border border-[#222222]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">Profile:</span>
            <span className="text-xs font-semibold text-zinc-200">{activeProfileName}</span>
          </div>
        )}

        {hasUnsavedChanges && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Unsaved Edits in RAM
          </div>
        )}

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
