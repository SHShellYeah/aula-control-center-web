// ============================================================================
// Versioned Keyboard Profile Schema & Type Definitions
// Schema Version 1 — Completely isolated to in-memory simulation & local storage
// Zero hardware secrets, serial numbers, or device identifiers are stored.
// ============================================================================

export interface ProfileRgbConfig {
  effectId: number;
  brightness: number;
  speed: number;
  color: string;
  colorful: boolean;
}

export interface SimulatorProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isPreset?: boolean;       // Built-in presets cannot be deleted or renamed
  matrix1024: number[];     // Exactly 1024 bytes (512 Table 0 + 512 Table 1)
  rgb?: ProfileRgbConfig;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ProfileImportResult {
  success: boolean;
  profile?: SimulatorProfile;
  error?: string;
}
