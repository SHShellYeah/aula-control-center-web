# AULA Control Center Web

A community-developed, Linux-focused web configurator and diagnostic toolkit for the **AULA F75** 75% mechanical keyboard (VID `0x258A`, PID `0x010C`).

This project is independently developed in [SHShellYeah/aula-control-center-web](https://github.com/SHShellYeah/aula-control-center-web), based upon the foundational work of [OpenAula](https://github.com/not-ayan/openaula) and enhanced with a safe in-memory simulator, versioned profile management, protocol validation, and guarded WebHID read-only telemetry.

---

## Deployment Status

**Live demo: Not deployed yet.**

*This application is currently run, tested, and audited locally. A public web deployment will be configured later by the maintainer.*

---

## Operational Architecture & Hardware Boundaries

The application enforces a strict operational separation between virtual simulation and guarded hardware access:

```
┌────────────────────────────────────────────────────────┐
│                   AULA F75 Web App                     │
├───────────────────────────┬────────────────────────────┤
│   In-Memory Simulator     │  Guarded WebHID Read-Only  │
│   (Default / 100% RAM)    │  (VID 0x258A: PID 0x010C)  │
├───────────────────────────┼────────────────────────────┤
│ • Virtual 1024-byte matrix│ • Explicit user click      │
│ • Local JSON profiles     │ • Capability validation    │
│ • Safe key remapping      │ • Mutex serialized I/O     │
│ • Zero hardware risk      │ • Zero commands on connect │
│                           │ • Only CMD 0x82 & 0x83     │
│                           │ • All writes fail closed   │
└───────────────────────────┴────────────────────────────┘
```

1. **Fully Functional Simulator Features (Default):**
   - 100% in-memory virtual keyboard layout visualizer (75% ANSI, 80 keys + volume knob).
   - Virtual key remapping, modifier combos (`Ctrl`, `Shift`, `Alt`, `Win`), and factory presets.
   - Versioned profile manager (Schema v1) with atomic imports, JSON export, and storage corruption resilience.
   - Virtual RGB preview across 15 lighting modes and 14 LED clusters.
   - Absolutely zero physical USB interaction in simulator mode.

2. **Implemented & Mock-Tested WebHID Read-Only Support:**
   - **Target Hardware:** Strictly wired AULA F75 (`VID 0x258A, PID 0x010C`). Wireless 2.4GHz dongles (`0x3554:0xFA09`) and Bluetooth are rejected.
   - **User Gesture Required:** Connection modal is opened only on explicit user click. Never connects automatically on page load or via polling.
   - **Capability Verification:** Audits HID collection descriptors for vendor collection (`usagePage >= 0xFF00`) with Feature Report ID `6` prior to opening.
   - **Zero Commands on Connect:** Selecting and opening the interface dispatches zero feature reports.
   - **Approved Queries Only:**
     - `CMD 0x82`: Device Identity Query (reads 14-byte ASCII model string; handles Linux `HIDIOCGFEATURE` short buffers).
     - `CMD 0x83`: Keymap Layer 0 Readback (reads 512-byte Table 0; validates Esc, Fn, and slot 127 sentinel integrity).
   - **Deferred Queries:** `CMD 0x84` (LED/sleep config) and `CMD 0x8A` (color/macro read) are deferred to protect microcontroller endpoints.
   - **Transaction Mutex:** All feature report transmissions and receptions are serialized through a promise-based mutex.
   - **State Isolation:** Hardware reads populate separate device telemetry state and never silently overwrite simulator profiles. An explicit "Import to Simulator" button allows safe virtual testing of readback keymaps.

3. **Physical Reads Awaiting Manual Validation:**
   - Real-hardware execution of `CMD 0x82` and `CMD 0x83` is implemented and verified against mocked WebHID transports, but awaits manual confirmation on individual physical keyboards across various factory firmware revisions.

4. **Explicitly Unsupported Configuration Writes:**
   - Keymap flashing (`0x03`), configuration writes (`0x04`), macro uploads (`0x05`), LED matrix flashing (`0x06`), live streaming (`0x08`), and factory resets (`0x11`) are **strictly blocked and fail closed**.

Detailed specifications:
- Read [docs/HARDWARE-READONLY-MODE.md](docs/HARDWARE-READONLY-MODE.md) for protocol details and manual testing instructions.
- Read [docs/SIMULATOR-ONLY-MODE.md](docs/SIMULATOR-ONLY-MODE.md) for simulator architecture.
- Read [docs/PROFILES-SCHEMA.md](docs/PROFILES-SCHEMA.md) for profile schema v1.

---

## Safety Model & Residual Risk Notice

> [!IMPORTANT]
> **Safety Notice:** Passing automated offline unit tests does not equal verified physical hardware safety. Operating reverse-engineered software with physical hardware carries residual risks:
> - Unexpected feature reports on 8051-based microcontrollers (e.g. Sinowealth SH68F90A) can trigger endpoint stall (`STALL_PID`) conditions requiring cable re-plugging.
> - Concurrent execution of proprietary AULA software or third-party HID daemons may cause OS access conflicts.
> - No claim of absolute zero risk on physical hardware is made.

---

## Developer Commands

This repository uses standard `npm` workflows with committed package manifests:

```bash
# Clean install dependencies
npm ci

# Start local development server with HMR
npm run dev

# Run automated test suite (53 tests across 6 suites)
npm test

# Run TypeScript type check
npm run typecheck

# Run linter (oxlint)
npm run lint

# Build production bundle to dist/
npm run build
```

### Dependency Audit Note
Running `npm audit` against `registry.npmjs.org` currently returns an HTTP 403 Forbidden registry policy response (`Request to POST /-/npm/v1/security/audits/quick on registry.npmjs.org not allowed by policy`). This limitation is tracked and handled non-blockingly in CI.

---

## Upstream Attribution & Community Provenance

AULA Control Center Web builds upon reverse-engineering research and open-source contributions from the mechanical keyboard community:

- **[OpenAula](https://github.com/not-ayan/openaula)** by [not-ayan](https://github.com/not-ayan):
  - Provided the original web UI concepts and reverse-engineered WebHID protocol mapping for the AULA F75.
- **[veysiemrah/aula-rgb-controller](https://github.com/veysiemrah/aula-rgb-controller)** by [Veysi Emrah](https://github.com/veysiemrah):
  - Reverse-engineering research into the SinoWealth LED memory map and packet structures.
- **[OpenRGB](https://gitlab.com/rodrigost23/OpenRGB)** by [Rodrigo Tavares](https://gitlab.com/rodrigost23) and the OpenRGB project:
  - Technical documentation on SinoWealth controller behavior.

### Licensing

This repository is distributed under the [MIT License](LICENSE).

---

## Disclaimer

This is an independent community project. It is **not** affiliated with, endorsed by, or sponsored by AULA, Epomaker, SinoWealth, or any of their affiliates.
