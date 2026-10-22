# AULA Control Center Web

A community-developed, Linux-focused web configurator and diagnostic toolkit for the **AULA F75** 75% mechanical keyboard (VID `0x258A`, PID `0x010C`).

This project is independently developed in [SHShellYeah/aula-control-center-web](https://github.com/SHShellYeah/aula-control-center-web), based upon the foundational work of [OpenAula](https://github.com/not-ayan/openaula) and enhanced with a safe in-memory simulator, versioned profile management, protocol validation, and guarded WebHID diagnostics.

---

## Deployment Status

**Live demo: Not deployed yet.**

*This application is currently run, tested, and audited locally. A public web deployment will be configured later by the maintainer.*

---

## Milestone 1: Simulator-Only Architecture

In Milestone 1, our top priority is the absolute protection of the keyboard controller and flash memory:
- **100% In-Memory Simulation (`SimulatorTransport`):** All layout inspection, virtual key remapping, modifier combos, RGB lighting previews, and profile workflows run entirely in browser RAM.
- **Physical Hardware Connections Disabled:** Real USB communication (`requestDevice`, `getDevices`, `open`, `sendFeatureReport`, `sendReport`, `receiveFeatureReport`) is deliberately disabled in Milestone 1 to prevent any risk of hardware flash corruption or physical Fn lockout.
- **Detailed Documentation:**
  - Read [docs/SIMULATOR-ONLY-MODE.md](docs/SIMULATOR-ONLY-MODE.md) for full safety policies and protocol protection.
  - Read [docs/PROFILES-SCHEMA.md](docs/PROFILES-SCHEMA.md) for profile schema v1 and atomic validation rules.

---

## Current Capabilities

The features below reflect the actual, implemented capabilities in the current source code:

- **Browser-Based Modern Stack:** Built on React 19, TypeScript, Vite, and Tailwind CSS. Runs in modern browsers with zero backend or native daemon requirement.
- **In-Memory Keyboard Simulator:**
  - Interactive visualizer of the 80-key 75% ANSI layout.
  - Complete mock RAM buffer maintaining matrix integrity.
  - Test layouts, matrix inspections, and color schemes safely with zero hardware connected.
- **Local Key Remapping Preview:**
  - Inspect matrix indices and default HID keycodes.
  - Preview single-key remaps and multi-modifier combos (`Ctrl`, `Shift`, `Alt`, `Win`).
  - Simulated key remapping updates in RAM with visual indicators.
- **Versioned Profile Management (Schema v1):**
  - Create, duplicate, rename, and delete custom profiles.
  - Built-in presets: *Factory Default ANSI*, *macOS Modifier Layout* (swapped Win/Alt), and *Gaming Lock Layout*.
  - Export profiles as clean, portable JSON files.
  - **Atomic Profile Import:** Strict multi-stage validation ensures corrupt or incompatible JSON files are rejected before touching simulator state.
  - **Storage Resilience:** Gracefully catches corrupt localStorage data or quota exceptions and falls back to in-memory store.
  - **State Clarity:** Transparently tracks and highlights unsaved edits against the saved profile.
- **RGB Lighting Controls & Preview:**
  - Preview 15 hardware lighting modes (Static, Breathing, Rainbow Wave, Aurora, Reactive, etc.).
  - Adjust simulated speed (0–4) and brightness (1–4) levels.
  - Select color presets across 14 simulated LED clusters.
- **Continuous Integration (CI):**
  - Fully automated GitHub Actions workflow (`.github/workflows/ci.yml`) executing dependency installation, tests, TypeScript type checking, linting, and production builds on every push and pull request.

### Blocked & Disabled Operations

To protect physical hardware from corruption or bricking, the following operations are **strictly blocked and fail closed**:
- **Hardware Connection:** Real USB connections are disabled in Milestone 1.
- **Hardware Configuration Writes:** Flashing modified keymaps to physical EEPROM/flash is blocked.
- **Macro Uploads:** Writing arbitrary key sequences or macro scripts to hardware memory is disabled.
- **Factory Resets:** Automated hardware resets and unverified repair routines are disabled.
- **Arbitrary HID Packets:** Raw packet sending and non-allowlisted opcodes are rejected by the safety policy.

---

## Safety Model & Hardware Notice

> [!IMPORTANT]
> **Safety Notice:** Passing automated unit tests does not equal verified physical hardware safety. Physical device queries are subject to ongoing real-device hardware validation across different firmware revisions. No claim of absolute zero risk on physical hardware is made.

1. **Simulator Mode by Default:** On page load, the application always initializes in in-memory simulator mode (`SimulatorTransport`). No `navigator.hid` calls or USB requests occur automatically.
2. **Resilience to Missing or Throwing `navigator.hid`:** If `navigator.hid` is undefined or throws an error (e.g. in restricted sandboxes or non-Chromium browsers), simulator workflows continue uninterrupted.
3. **Critical Matrix Protection:**
   - **Physical Fn Key (Matrix Index 53):** Guarded at the policy level to prevent overwriting the essential `[13, 0, 0, 0]` record that enables the keyboard's physical Fn layer.
   - **Slot 127 Integrity Check:** Treated conservatively without inventing artificial invariants; accepts standard null padding (`[0, 0, 0, 0]`) and the disputed marker (`[0, 0, 0x5A, 0xA5]`).
4. **Fail-Closed Policy:** Any command, opcode, or payload structure not explicitly present on the read-only query allowlist is immediately rejected before transmission.

---

## Developer Commands

This repository uses standard `npm` workflows with committed package manifests:

```bash
# Clean install dependencies
npm ci

# Start local development server with HMR
npm run dev

# Run automated test suite (Node.js test runner)
npm test

# Run TypeScript type check
npm run typecheck

# Run linter (oxlint)
npm run lint

# Build production bundle to dist/
npm run build
```

---

## Upstream Attribution & Community Provenance

AULA Control Center Web builds upon reverse-engineering research and open-source contributions from the mechanical keyboard community:

- **[OpenAula](https://github.com/not-ayan/openaula)** by [not-ayan](https://github.com/not-ayan):
  - Provided the original web UI concepts and reverse-engineered WebHID protocol mapping for the AULA F75.
  - AULA Control Center Web builds on this foundation by adding a Linux-focused design, an isolated in-memory simulator, protocol safety policies, and guarded read-only WebHID diagnostics.
- **[veysiemrah/aula-rgb-controller](https://github.com/veysiemrah/aula-rgb-controller)** by [Veysi Emrah](https://github.com/veysiemrah):
  - Reverse-engineering research into the SinoWealth LED memory map, 21-byte hardware register gaps, and lighting packet structures.
- **[OpenRGB](https://gitlab.com/rodrigost23/OpenRGB)** by [Rodrigo Tavares](https://gitlab.com/rodrigost23) and the OpenRGB project:
  - Technical documentation on SinoWealth controller behavior and LED cluster addressing.

### Licensing

- Upstream OpenAula documented its release under the **MIT License** in its project README without an accompanying standalone root `LICENSE` file.
- This repository provides an explicit [LICENSE](LICENSE) file under the **MIT License**, preserving upstream attribution while clarifying licensing for downstream users.

---

## Disclaimer

This is an independent community project. It is **not** affiliated with, endorsed by, or sponsored by AULA, Epomaker, SinoWealth, or any of their affiliates.

The software is provided "as is", without warranty of any kind, express or implied. Operating reverse-engineered software with physical hardware is done at your own discretion.
