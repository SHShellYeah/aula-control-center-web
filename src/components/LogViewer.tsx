import React, { useRef, useEffect, useState } from 'react';
import { Terminal, Trash2, Copy, Check, Activity, ShieldCheck, ShieldAlert, Cpu } from 'lucide-react';
import { webhid, type InterfaceDiagnostic } from '../services/webhid';

interface LogViewerProps {
  logs: string[];
  onClear: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClear }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<InterfaceDiagnostic[]>([]);

  useEffect(() => {
    setDiagnostics(webhid.getDiagnostics());
  }, [logs]);

  // Auto-scroll to bottom when new log entries arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    if (logs.length === 0) return;
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Card: Interface Diagnostics */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-medium">
                SECURITY &amp; INTERFACE CLEARANCE
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Mode: {webhid.activeMode === 'simulation' ? 'Simulator RAM' : 'Read-Only Hardware'}
              </span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              HID Collections &amp; Browser Sandbox Status
            </h3>
            <p className="text-xs text-zinc-400">
              Inspection of USB HID collections against Chrome/Edge Protected Usage blocklists and safety policies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {diagnostics.map((col) => {
            const isSafe = col.clearanceStatus === 'safe_vendor_pipe';
            return (
              <div
                key={col.collectionIndex}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                  isSafe
                    ? 'bg-[#141b18] border-emerald-500/30'
                    : 'bg-[#1b1414] border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {isSafe ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                    )}
                    Collection #{col.collectionIndex}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      isSafe
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {isSafe ? 'SAFE VENDOR PIPE' : 'PROTECTED USAGE BLOCKED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400">
                  <div>
                    Usage Page: <span className="text-white">0x{col.usagePage.toString(16).toUpperCase().padStart(4, '0')}</span>
                  </div>
                  <div>
                    Usage ID: <span className="text-white">0x{col.usage.toString(16).toUpperCase().padStart(2, '0')}</span>
                  </div>
                  <div>
                    Report IDs: <span className="text-cyan-300">[{col.reportIds.join(', ')}]</span>
                  </div>
                  <div>
                    Reports: In {col.inputReportsCount} | Out {col.outputReportsCount} | Feat {col.featureReportsCount}
                  </div>
                </div>

                <p className="text-[10px] text-zinc-400">
                  {isSafe
                    ? 'Approved vendor-defined pipe for non-mutating device telemetry (0x82, 0x83, 0x84).'
                    : 'Standard system keyboard usage (0x0001:0x0006). Protected by OS/browser against keylogging.'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Terminal View */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 space-y-5">
        {/* Header with Eyebrow and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-[#1c1c1c]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase font-medium">
                REAL-TIME TELEMETRY
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE STREAM
              </span>
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Diagnostics &amp; WebHID Packet Log
            </h3>
            <p className="text-xs text-zinc-400">
              Real-time monitoring of raw WebHID packets, key remapping payloads, and matrix state operations.
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              disabled={logs.length === 0}
              className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] hover:border-[#383838] text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shadow-sm"
              title="Copy logs to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  Copy Logs
                </>
              )}
            </button>

            <button
              onClick={onClear}
              disabled={logs.length === 0}
              className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] hover:border-[#383838] text-xs font-semibold text-zinc-300 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shadow-sm group"
              title="Clear all recorded logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-rose-400 transition-colors" />
              Clear Logs
            </button>
          </div>
        </div>

        {/* Terminal View Container */}
        <div
          ref={logContainerRef}
          className="bg-[#080808] border border-[#1e1e1e] rounded-xl p-4 h-[380px] overflow-y-auto space-y-1.5 font-mono text-xs text-zinc-300 shadow-inner"
        >
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600 space-y-2 py-12">
              <Activity className="w-8 h-8 text-zinc-700 stroke-1" />
              <p className="text-xs font-medium text-zinc-500">No telemetry packets recorded yet</p>
              <p className="text-[11px] text-zinc-600 max-w-xs">
                Actions taken across the app (remapping, connecting, or reading dumps) will output real-time event packet logs here.
              </p>
            </div>
          ) : (
            logs.map((log, i) => {
              const isError = log.includes('ERROR') || log.includes('Failed') || log.includes('❌') || log.includes('SECURITY BLOCK');
              const isSuccess = log.includes('SUCCESS') || log.includes('VERIFIED') || log.includes('RESTORED') || log.includes('✓');
              const isTx = log.includes('TX') || log.includes('Writing') || log.includes('Write') || log.includes('Sent');

              return (
                <div
                  key={i}
                  className={`py-0.5 px-1.5 rounded flex items-start gap-2 leading-relaxed transition-colors ${
                    isError
                      ? 'bg-rose-500/10 text-rose-300 border-l-2 border-rose-500 font-semibold'
                      : isSuccess
                      ? 'text-emerald-400 font-medium'
                      : isTx
                      ? 'text-cyan-300 font-medium'
                      : 'text-zinc-400 hover:bg-[#111111]'
                  }`}
                >
                  <span className="text-[10px] text-zinc-600 shrink-0 select-none pt-0.5">
                    {(i + 1).toString().padStart(3, '0')}
                  </span>
                  <span className="break-all">{log}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info Bar */}
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 px-1 pt-1">
          <span>Total Log Entries: <strong className="text-zinc-300 font-normal">{logs.length}</strong></span>
          <span>AULA F75 WebHID Driver Telemetry v1.0</span>
        </div>
      </div>
    </div>
  );
};

