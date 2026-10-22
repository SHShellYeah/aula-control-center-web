// ============================================================================
// Versioned Simulator Profile Service
// Schema Version 1 — Robust in-memory & local storage persistence
// Privacy Guarantee: Zero hardware secrets, serial numbers, or device IDs stored.
// Resilience Guarantee: Corrupt local storage is caught gracefully without crash.
// Atomic Guarantee: Incompatible or corrupt profile imports fail closed without
// mutating existing simulator state.
// ============================================================================

import type { SimulatorProfile, ProfileImportResult, ProfileValidationResult } from '../types/profile.ts';
import {
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
  DEFAULT_ESC_KEY_CODE,
} from '../safety/SafetyPolicy.ts';

import { SimulatorTransport } from './simulatorTransport.ts';

const STORAGE_PROFILES_KEY = 'aula_f75_simulator_profiles_v1';
const STORAGE_ACTIVE_ID_KEY = 'aula_f75_active_profile_id_v1';

export class ProfileService {
  private inMemoryProfiles: Map<string, SimulatorProfile> = new Map();
  private activeProfileId: string = 'profile-default-ansi';
  private storageAvailable: boolean = true;
  private listeners: ((profiles: SimulatorProfile[], activeId: string) => void)[] = [];

  constructor() {
    this.initStorage();
  }

  /**
   * Initializes profiles from localStorage or creates default presets.
   * Catches storage corruption or QuotaExceeded errors gracefully.
   */
  private initStorage(): void {
    const defaultPresets = this.generateDefaultPresets();
    defaultPresets.forEach((p) => this.inMemoryProfiles.set(p.id, p));

    try {
      if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        this.storageAvailable = false;
        return;
      }

      const storedRaw = window.localStorage.getItem(STORAGE_PROFILES_KEY);
      if (storedRaw) {
        try {
          const parsed = JSON.parse(storedRaw);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              const validation = this.validateProfileObject(item);
              if (validation.valid) {
                this.inMemoryProfiles.set(item.id, item as SimulatorProfile);
              } else {
                console.warn(`[ProfileService] Skipped corrupt profile in storage: ${item?.id}`, validation.errors);
              }
            });
          }
        } catch (parseErr) {
          console.warn('[ProfileService] Corrupt JSON detected in localStorage. Preserving default presets.', parseErr);
        }
      }

      const storedActiveId = window.localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
      if (storedActiveId && this.inMemoryProfiles.has(storedActiveId)) {
        this.activeProfileId = storedActiveId;
      } else {
        this.activeProfileId = 'profile-default-ansi';
      }
    } catch (err) {
      this.storageAvailable = false;
      console.warn('[ProfileService] Storage access restricted or throwing. Operating in pure in-memory mode.', err);
    }
  }

  private persist(): void {
    if (!this.storageAvailable) return;
    try {
      const arr = Array.from(this.inMemoryProfiles.values());
      window.localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(arr));
      window.localStorage.setItem(STORAGE_ACTIVE_ID_KEY, this.activeProfileId);
    } catch (err) {
      console.warn('[ProfileService] Failed to persist profiles to localStorage (quota or access error):', err);
    }
  }

  private notify(): void {
    const list = this.listProfiles();
    this.listeners.forEach((fn) => fn(list, this.activeProfileId));
  }

  public subscribe(fn: (profiles: SimulatorProfile[], activeId: string) => void): () => void {
    this.listeners.push(fn);
    fn(this.listProfiles(), this.activeProfileId);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public generateDefaultPresets(): SimulatorProfile[] {
    const now = new Date().toISOString();
    const sim = new SimulatorTransport();
    const stockMatrix = Array.from(sim.getFullMatrix1024());

    // Mac Preset (Swapped Win at slot 11 and Alt at slot 17)
    const macMatrix = [...stockMatrix];
    const off11 = 11 * 4;
    const off17 = 17 * 4;
    macMatrix[off11 + 1] = 0x04; // AltLeft modifier at 11
    macMatrix[off11 + 3] = 0xE2;
    macMatrix[off17 + 1] = 0x08; // MetaLeft modifier at 17
    macMatrix[off17 + 3] = 0xE3;

    // Gaming Preset (Windows key lock - slot 11 disabled)
    const gamingMatrix = [...stockMatrix];
    gamingMatrix[off11] = 0x00;
    gamingMatrix[off11 + 1] = 0x00;
    gamingMatrix[off11 + 2] = 0x00;
    gamingMatrix[off11 + 3] = 0x00;

    return [
      {
        schemaVersion: 1,
        id: 'profile-default-ansi',
        name: 'Factory Default ANSI',
        description: 'Standard factory stock 75% QWERTY layout matching pristine F75 hardware matrix.',
        isPreset: true,
        createdAt: now,
        updatedAt: now,
        matrix1024: stockMatrix,
        rgb: {
          effectId: 3,
          brightness: 4,
          speed: 2,
          color: '#00E5FF',
          colorful: true,
        },
      },
      {
        schemaVersion: 1,
        id: 'profile-macos-mode',
        name: 'macOS Modifier Layout',
        description: 'Swaps physical Left Win and Left Alt keys for native Command and Option placement.',
        isPreset: true,
        createdAt: now,
        updatedAt: now,
        matrix1024: macMatrix,
        rgb: {
          effectId: 1,
          brightness: 4,
          speed: 2,
          color: '#6366F1',
          colorful: false,
        },
      },
      {
        schemaVersion: 1,
        id: 'profile-gaming-wasd',
        name: 'Gaming Lock Layout',
        description: 'Disables Left Windows key during simulator sessions to prevent accidental desktop minimizes.',
        isPreset: true,
        createdAt: now,
        updatedAt: now,
        matrix1024: gamingMatrix,
        rgb: {
          effectId: 2,
          brightness: 4,
          speed: 3,
          color: '#10B981',
          colorful: false,
        },
      },
    ];
  }

  public listProfiles(): SimulatorProfile[] {
    return Array.from(this.inMemoryProfiles.values());
  }

  public getActiveProfile(): SimulatorProfile {
    const profile = this.inMemoryProfiles.get(this.activeProfileId);
    if (profile) return profile;
    return this.inMemoryProfiles.get('profile-default-ansi') || this.generateDefaultPresets()[0];
  }

  public getProfileById(id: string): SimulatorProfile | undefined {
    return this.inMemoryProfiles.get(id);
  }

  public setActiveProfile(id: string): { success: boolean; profile?: SimulatorProfile; error?: string } {
    const profile = this.inMemoryProfiles.get(id);
    if (!profile) {
      return { success: false, error: `Profile not found: ${id}` };
    }
    this.activeProfileId = id;
    this.persist();
    this.notify();
    return { success: true, profile };
  }

  public createProfile(name: string, description: string = '', baseMatrix?: Uint8Array): SimulatorProfile {
    const trimmedName = name.trim() || 'Untitled Profile';
    const now = new Date().toISOString();
    const id = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const matrix = baseMatrix
      ? Array.from(baseMatrix.subarray(0, 1024))
      : Array.from(new SimulatorTransport().getFullMatrix1024());

    const newProfile: SimulatorProfile = {
      schemaVersion: 1,
      id,
      name: trimmedName,
      description: description.trim(),
      isPreset: false,
      createdAt: now,
      updatedAt: now,
      matrix1024: matrix,
    };

    this.inMemoryProfiles.set(id, newProfile);
    this.activeProfileId = id;
    this.persist();
    this.notify();
    return newProfile;
  }

  public renameProfile(id: string, newName: string): { success: boolean; error?: string } {
    const profile = this.inMemoryProfiles.get(id);
    if (!profile) return { success: false, error: 'Profile not found.' };
    if (profile.isPreset) return { success: false, error: 'Cannot rename built-in preset profiles.' };
    const trimmed = newName.trim();
    if (!trimmed) return { success: false, error: 'Profile name cannot be empty.' };

    profile.name = trimmed;
    profile.updatedAt = new Date().toISOString();
    this.persist();
    this.notify();
    return { success: true };
  }

  public duplicateProfile(id: string, newName?: string): SimulatorProfile {
    const source = this.inMemoryProfiles.get(id) || this.getActiveProfile();
    const now = new Date().toISOString();
    const newId = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const copyName = newName?.trim() || `${source.name} (Copy)`;

    const duplicated: SimulatorProfile = {
      schemaVersion: 1,
      id: newId,
      name: copyName,
      description: source.description || '',
      isPreset: false,
      createdAt: now,
      updatedAt: now,
      matrix1024: [...source.matrix1024],
      rgb: source.rgb ? { ...source.rgb } : undefined,
    };

    this.inMemoryProfiles.set(newId, duplicated);
    this.activeProfileId = newId;
    this.persist();
    this.notify();
    return duplicated;
  }

  public deleteProfile(id: string): { success: boolean; error?: string } {
    const profile = this.inMemoryProfiles.get(id);
    if (!profile) return { success: false, error: 'Profile not found.' };
    if (profile.isPreset) return { success: false, error: 'Cannot delete built-in preset profiles.' };

    this.inMemoryProfiles.delete(id);
    if (this.activeProfileId === id) {
      this.activeProfileId = 'profile-default-ansi';
    }
    this.persist();
    this.notify();
    return { success: true };
  }

  public saveActiveProfileMatrix(matrix1024: Uint8Array): void {
    const profile = this.getActiveProfile();
    if (profile.isPreset) {
      // If user edits a preset, auto-fork it into a user profile
      const userFork = this.duplicateProfile(profile.id, `${profile.name} (Customized)`);
      userFork.matrix1024 = Array.from(matrix1024.subarray(0, 1024));
      userFork.updatedAt = new Date().toISOString();
      this.persist();
      this.notify();
      return;
    }

    profile.matrix1024 = Array.from(matrix1024.subarray(0, 1024));
    profile.updatedAt = new Date().toISOString();
    this.persist();
    this.notify();
  }

  public exportProfile(id: string): string {
    const profile = this.inMemoryProfiles.get(id) || this.getActiveProfile();
    const exportPayload: SimulatorProfile = {
      schemaVersion: 1,
      id: profile.id,
      name: profile.name,
      description: profile.description,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      matrix1024: profile.matrix1024,
      rgb: profile.rgb,
    };
    return JSON.stringify(exportPayload, null, 2);
  }

  public validateProfileObject(obj: any): ProfileValidationResult {
    const errors: string[] = [];
    if (!obj || typeof obj !== 'object') {
      return { valid: false, errors: ['Input is not a valid JSON object.'] };
    }

    // Check matrix data presence
    let matrixData: number[] | null = null;
    if (Array.isArray(obj.matrix1024)) {
      matrixData = obj.matrix1024;
    } else if (Array.isArray(obj.matrixData)) {
      matrixData = obj.matrixData;
    } else if (Array.isArray(obj.layer0)) {
      matrixData = obj.layer0;
    }

    if (!matrixData || (matrixData.length !== 1024 && matrixData.length !== 512)) {
      errors.push(`Invalid matrix size: expected 1024 or 512 bytes, got ${matrixData ? matrixData.length : 0}`);
    } else {
      // Validate slot 0 Esc
      if (matrixData[0] !== 0 || matrixData[3] !== DEFAULT_ESC_KEY_CODE) {
        errors.push(`Escape key check failed: Slot 0 must map to Escape (0x${DEFAULT_ESC_KEY_CODE.toString(16)})`);
      }

      // Validate slot 53 Fn
      const fnOffset = PHYSICAL_FN_MATRIX_INDEX * 4;
      if (matrixData[fnOffset] !== 0x0D) {
        errors.push(`Physical Fn key invariant violated: Slot 53 must have keyType 0x0D (13)`);
      }

      // Conservative Slot 127 Check (bytes 508..511)
      const sentOffset = LAYER_SENTINEL_INDEX * 4;
      const b2 = matrixData[sentOffset + 2];
      const b3 = matrixData[sentOffset + 3];
      const isSentinel = b2 === 0x5A && b3 === 0xA5;
      const isZeroPadding = b2 === 0x00 && b3 === 0x00;
      if (!isSentinel && !isZeroPadding) {
        errors.push(`Slot 127 check failed: bytes 510..511 must be [0x00, 0x00] or marker [0x5A, 0xA5]`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Imports a profile JSON string.
   * Atomic guarantee: If validation fails, existing simulator state and profile store
   * are completely untouched.
   */
  public importProfile(jsonString: string): ProfileImportResult {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return {
        success: false,
        error: 'Malformed JSON: Unable to parse file as valid JSON.',
      };
    }

    const validation = this.validateProfileObject(parsed);
    if (!validation.valid) {
      return {
        success: false,
        error: `Profile validation failed: ${validation.errors.join('; ')}`,
      };
    }

    // Reconstruct full 1024 bytes if only 512 was supplied
    let fullMatrix: number[];
    if (parsed.matrix1024 && parsed.matrix1024.length === 1024) {
      fullMatrix = parsed.matrix1024;
    } else if (parsed.matrixData && parsed.matrixData.length === 1024) {
      fullMatrix = parsed.matrixData;
    } else {
      const l0 = parsed.matrix1024 || parsed.matrixData || parsed.layer0;
      const sim = new SimulatorTransport();
      const defaultFull = sim.getFullMatrix1024();
      const full = new Uint8Array(1024);
      full.set(defaultFull);
      full.set(l0.slice(0, 512), 0);
      fullMatrix = Array.from(full);
    }

    const now = new Date().toISOString();
    const id = `profile-imported-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const name = typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : typeof parsed.label === 'string' && parsed.label.trim()
      ? parsed.label.trim()
      : 'Imported Profile';

    const newProfile: SimulatorProfile = {
      schemaVersion: 1,
      id,
      name,
      description: typeof parsed.description === 'string' ? parsed.description : 'Imported JSON profile',
      isPreset: false,
      createdAt: parsed.createdAt || now,
      updatedAt: now,
      matrix1024: fullMatrix,
      rgb: parsed.rgb,
    };

    this.inMemoryProfiles.set(id, newProfile);
    this.activeProfileId = id;
    this.persist();
    this.notify();

    return {
      success: true,
      profile: newProfile,
    };
  }

  public hasUnsavedChanges(currentMatrix: Uint8Array): boolean {
    const active = this.getActiveProfile();
    if (!active || !active.matrix1024) return false;
    const len = Math.min(currentMatrix.length, active.matrix1024.length);
    for (let i = 0; i < len; i++) {
      if (currentMatrix[i] !== active.matrix1024[i]) return true;
    }
    return false;
  }
}

export const profileService = new ProfileService();
