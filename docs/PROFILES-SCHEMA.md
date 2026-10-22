# Simulator Profile Schema & Storage Specification (v1)

## Overview

AULA Control Center Web provides a versioned, portable JSON profile format for storing and sharing simulated keyboard configurations.

- **Schema Version:** `1`
- **Scope:** 100% In-Memory Simulation & Browser Local Storage
- **Privacy Guarantee:** Zero hardware serial numbers, device secrets, or machine identifiers are stored.

---

## Schema Definition (`SimulatorProfile`)

```typescript
export interface ProfileRgbConfig {
  effectId: number;       // 0..18 (hardware effect index)
  brightness: number;     // 1..4
  speed: number;          // 0..4
  color: string;          // Hex format, e.g. '#00E5FF'
  colorful: boolean;      // True for multi-color / spectrum mode
}

export interface SimulatorProfile {
  schemaVersion: 1;       // Version identifier (required)
  id: string;             // Unique identifier, e.g. 'profile-default-ansi'
  name: string;           // Display name (e.g. 'macOS Modifier Layout')
  description: string;    // Human-readable notes or purpose
  createdAt: string;      // ISO 8601 timestamp
  updatedAt: string;      // ISO 8601 timestamp
  isPreset?: boolean;     // Built-in presets cannot be deleted or renamed
  matrix1024: number[];   // Exactly 1024 numeric bytes (Table 0 + Table 1)
  rgb?: ProfileRgbConfig; // Optional RGB lighting preset
}
```

---

## Example Profile JSON

```json
{
  "schemaVersion": 1,
  "id": "profile-custom-dev",
  "name": "Developer Layout (Mac Mode)",
  "description": "Swapped Left Win (Command) and Left Alt (Option) with cyan backlight",
  "createdAt": "2026-10-22T13:00:00.000Z",
  "updatedAt": "2026-10-22T13:00:00.000Z",
  "matrix1024": [
    0, 0, 0, 41,
    0, 0, 0, 53
    /* ... 1024 bytes total ... */
  ],
  "rgb": {
    "effectId": 1,
    "brightness": 4,
    "speed": 2,
    "color": "#00E5FF",
    "colorful": false
  }
}
```

---

## Validation & Atomic Import Guarantee

When importing a profile via JSON upload, the `ProfileService` executes a multi-stage validation pipeline:
1. **JSON Syntax:** Confirms file parses to valid JSON object.
2. **Matrix Size:** Requires exactly 1024 bytes (or 512 bytes for Table 0, which is auto-reconstructed to 1024 with default Table 1).
3. **Slot 0 Escape Invariant:** Verifies `byte[0] == 0` and `byte[3] == 0x29` (Escape key). Profiles missing an Escape key are rejected.
4. **Slot 53 Physical Fn Invariant:** Verifies `byte[212] == 0x0D` (13). Profiles with a corrupted Fn key are rejected.
5. **Conservative Slot 127 Check:** Verifies bytes 510..511 contain either standard zero-padding (`[0x00, 0x00]`) or the marker (`[0x5A, 0xA5]`).

> [!IMPORTANT]
> **Atomic Import Guarantee:** If any stage of validation fails, `importProfile` returns `{ success: false, error: ... }` and does **not** touch the active simulator keymap or existing profile storage.

---

## Storage Resilience & Failure Recovery

- **Corrupt Storage Recovery:** If browser `localStorage` contains malformed or unparseable JSON, `ProfileService` catches the error, logs a warning, and initializes safely with the built-in default presets (`Factory Default ANSI`, `macOS Modifier Layout`, `Gaming Lock Layout`).
- **Storage Quota / Access Exceptions:** In restricted browsing modes (e.g. private windows, sandboxed iframes, or when storage quota is exhausted), exceptions are caught gracefully, and the application seamlessly falls back to pure in-memory operation without crashing.
