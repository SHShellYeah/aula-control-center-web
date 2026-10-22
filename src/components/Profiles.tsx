import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Check,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  Edit2,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { profileService } from '../services/profileService';
import type { SimulatorProfile } from '../types/profile';

interface ProfilesProps {
  currentMatrix: Uint8Array;
  onApplyProfileToSimulator: (profile: SimulatorProfile) => void;
  onRefreshMatrix: () => void;
}

export const Profiles: React.FC<ProfilesProps> = ({
  currentMatrix,
  onApplyProfileToSimulator,
  onRefreshMatrix,
}) => {
  const [profiles, setProfiles] = useState<SimulatorProfile[]>(profileService.listProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(profileService.getActiveProfile().id);
  const [hasUnsaved, setHasUnsaved] = useState<boolean>(profileService.hasUnsavedChanges(currentMatrix));
  
  // Feedback banners
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Creation modal/inline state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileDesc, setNewProfileDesc] = useState<string>('');
  const [createFromCurrent, setCreateFromCurrent] = useState<boolean>(true);

  // Renaming state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  useEffect(() => {
    const unsubscribe = profileService.subscribe((list, activeId) => {
      setProfiles(list);
      setActiveProfileId(activeId);
      setHasUnsaved(profileService.hasUnsavedChanges(currentMatrix));
    });
    return unsubscribe;
  }, [currentMatrix]);

  useEffect(() => {
    setHasUnsaved(profileService.hasUnsavedChanges(currentMatrix));
  }, [currentMatrix, activeProfileId]);

  const activeProfile = profileService.getActiveProfile();

  const handleSelectProfile = (id: string) => {
    const res = profileService.setActiveProfile(id);
    if (res.success && res.profile) {
      onApplyProfileToSimulator(res.profile);
      setSuccessMessage(`Activated profile: "${res.profile.name}" in simulator RAM.`);
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error || 'Failed to activate profile.');
    }
  };

  const handleSaveToProfile = () => {
    profileService.saveActiveProfileMatrix(currentMatrix);
    const updated = profileService.getActiveProfile();
    onRefreshMatrix();
    setSuccessMessage(`Changes successfully saved to profile: "${updated.name}"`);
    setErrorMessage(null);
  };

  const handleRevertToProfile = () => {
    const active = profileService.getActiveProfile();
    onApplyProfileToSimulator(active);
    setSuccessMessage(`Reverted simulator RAM to saved state of "${active.name}".`);
    setErrorMessage(null);
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) {
      setErrorMessage('Profile name cannot be empty.');
      return;
    }

    const created = profileService.createProfile(
      newProfileName.trim(),
      newProfileDesc.trim(),
      createFromCurrent ? currentMatrix : undefined
    );

    setIsCreating(false);
    setNewProfileName('');
    setNewProfileDesc('');
    onApplyProfileToSimulator(created);
    setSuccessMessage(`Created and activated new profile: "${created.name}"`);
    setErrorMessage(null);
  };

  const handleStartRename = (profile: SimulatorProfile) => {
    if (profile.isPreset) return;
    setEditingId(profile.id);
    setEditingName(profile.name);
  };

  const handleSaveRename = (id: string) => {
    const res = profileService.renameProfile(id, editingName);
    if (res.success) {
      setEditingId(null);
      setSuccessMessage('Profile renamed successfully.');
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error || 'Failed to rename profile.');
    }
  };

  const handleDuplicate = (profile: SimulatorProfile) => {
    const copy = profileService.duplicateProfile(profile.id);
    onApplyProfileToSimulator(copy);
    setSuccessMessage(`Duplicated profile as: "${copy.name}"`);
    setErrorMessage(null);
  };

  const handleDelete = (profile: SimulatorProfile) => {
    if (profile.isPreset) {
      setErrorMessage('Cannot delete built-in preset profiles.');
      return;
    }
    if (confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
      const res = profileService.deleteProfile(profile.id);
      if (res.success) {
        const nextActive = profileService.getActiveProfile();
        onApplyProfileToSimulator(nextActive);
        setSuccessMessage(`Deleted profile "${profile.name}".`);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.error || 'Failed to delete profile.');
      }
    }
  };

  const handleExport = (profile: SimulatorProfile) => {
    const jsonStr = profileService.exportProfile(profile.id);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-profile.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSuccessMessage(`Exported JSON profile: "${profile.name}"`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = profileService.importProfile(text);
      if (res.success && res.profile) {
        onApplyProfileToSimulator(res.profile);
        setSuccessMessage(`✓ Profile "${res.profile.name}" successfully imported and validated!`);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.error || 'Profile validation failed. Existing simulator state remains unchanged.');
      }
    } catch (err: any) {
      setErrorMessage(`Import failed: ${err.message}. Existing simulator state remains unchanged.`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Active Profile Header */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-medium">
              SIMULATOR PROFILE MANAGER
            </div>
            <h2 className="text-xl font-bold text-white mt-1">Keyboard Profiles</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Create, customize, import, and export versioned keyboard configurations. Stored safely in local storage with zero device risks.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="py-2 px-3 rounded-xl bg-[#171b26] hover:bg-[#202636] border border-[#283042] text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              Import Profile JSON
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>

            <button
              onClick={() => setIsCreating(true)}
              className="py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Profile
            </button>
          </div>
        </div>

        {/* Active Profile Status Bar */}
        <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 font-mono">Active Profile:</span>
            <span className="font-bold text-white text-sm">{activeProfile.name}</span>
            {activeProfile.isPreset && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Built-in Preset
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasUnsaved ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Unsaved edits in RAM
                </span>
                <button
                  onClick={handleSaveToProfile}
                  className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 transition-all"
                >
                  <Save className="w-3 h-3" />
                  Save Edits
                </button>
                <button
                  onClick={handleRevertToProfile}
                  className="py-1 px-2.5 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] text-zinc-300 font-semibold text-xs flex items-center gap-1 transition-all"
                >
                  <RotateCcw className="w-3 h-3" />
                  Revert
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                All simulator edits saved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Success / Error Banners */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-zinc-500 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Create New Profile Form */}
      {isCreating && (
        <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Create Custom Profile
            </h3>
            <button
              onClick={() => setIsCreating(false)}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase mb-1">
                Profile Name
              </label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., Coding & Productivity Layout"
                className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#2a2a2a] text-white text-xs focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                placeholder="e.g., Swaps CapsLock to Control, customized function row"
                className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#2a2a2a] text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={createFromCurrent}
                  onChange={() => setCreateFromCurrent(true)}
                  className="accent-cyan-400"
                />
                Clone current simulator keymap
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!createFromCurrent}
                  onChange={() => setCreateFromCurrent(false)}
                  className="accent-cyan-400"
                />
                Start from pristine factory default
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="py-1.5 px-3 rounded-lg bg-[#1e1e1e] hover:bg-[#282828] text-xs font-semibold text-zinc-300 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-1.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-md"
              >
                Create Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profiles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {profiles.map((p) => {
          const isActive = p.id === activeProfileId;
          const isEditing = editingId === p.id;

          return (
            <div
              key={p.id}
              className={`bg-[#11131b] border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all ${
                isActive
                  ? 'border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] bg-[#131722]'
                  : 'border-[#1e2330] hover:border-slate-600'
              }`}
            >
              <div className="space-y-3">
                {/* Card Top: Icon & Tags */}
                <div className="flex items-center justify-between">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isActive
                        ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                        : 'bg-[#181d29] border border-[#252c3d] text-slate-400'
                    }`}
                  >
                    <Sliders className="w-4 h-4" />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.isPreset && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        Preset
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Name & Description */}
                <div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="w-full px-2 py-1 rounded bg-[#181818] border border-cyan-500 text-white text-xs"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(p.id)}
                        className="p-1 rounded bg-cyan-500 text-black hover:bg-cyan-400"
                        title="Save name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group">
                      <h3 className="text-sm font-bold text-white">{p.name}</h3>
                      {!p.isPreset && (
                        <button
                          onClick={() => handleStartRename(p)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-white transition-opacity"
                          title="Rename profile"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {p.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-3 border-t border-[#1c2230]">
                {isActive ? (
                  <button
                    disabled
                    className="w-full py-2 px-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 cursor-default"
                  >
                    <Check className="w-3.5 h-3.5" /> Active in Simulator
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectProfile(p.id)}
                    className="w-full py-2 px-3 rounded-xl bg-[#171b26] hover:bg-[#202636] border border-[#283042] text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-all"
                  >
                    Activate in Simulator
                  </button>
                )}

                {/* Sub-Actions: Duplicate, Export, Delete */}
                <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1">
                  <button
                    onClick={() => handleDuplicate(p)}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                    title="Duplicate Profile"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>

                  <button
                    onClick={() => handleExport(p)}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                    title="Export JSON"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>

                  {!p.isPreset && (
                    <button
                      onClick={() => handleDelete(p)}
                      className="hover:text-rose-400 flex items-center gap-1 transition-colors"
                      title="Delete Profile"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Schema & Safety Information Note */}
      <div className="p-4 rounded-xl bg-[#121212] border border-[#222222] text-xs text-zinc-400 flex items-start gap-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] leading-relaxed">
          <p className="font-semibold text-zinc-300">Profile Safety &amp; Invariant Guarantee:</p>
          <p>
            All imported profiles are strictly checked by the safety policy before touching simulator RAM.
            Profiles must preserve the physical Fn key invariant (slot 53) and Escape key record (slot 0).
            Failed imports abort atomically, leaving your active configuration completely unchanged.
          </p>
        </div>
      </div>
    </div>
  );
};
