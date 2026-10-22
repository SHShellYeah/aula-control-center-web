# AULA Control Center Web — Simulator-Only Mode & Safety Architecture

## Overview & Scope (Milestone 1)

**AULA Control Center Web** is designed as a browser-first, Linux-compatible configurator and diagnostic tool for the **AULA F75** 75% mechanical keyboard (VID `0x258A`, PID `0x010C`).

In **Milestone 1**, our highest engineering priority is the absolute protection of the physical keyboard controller and flash memory. For this reason, the application operates in **Simulator-Only Mode**:
- Physical hardware connections and USB I/O are deliberately disabled.
- All key remapping, modifier combo definitions, RGB lighting controls, and profile management workflows run entirely in browser memory (RAM) via `SimulatorTransport`.
- Passing automated unit tests does **not** count as real physical device validation; hardware writes remain permanently disabled until extensive hardware-in-the-loop reverse-engineering and multi-revision testing can be verified safely.

---

## Why Physical Hardware Operations Are Disabled

The AULA F75 keyboard utilizes a SinoWealth/EVVision microcontroller that manages USB HID communication, matrix scanning, and lighting shaders:
1. **Flash Corruption Risks:** Outbound SET_FEATURE reports (`CMD 0x03` keymap write, `CMD 0x04` config write, `CMD 0x06` planar LED write) write directly to onboard EEPROM/flash memory. If a payload has misaligned byte offsets or invalid checksums, it can corrupt key scanning registers or crash the MCU.
2. **The Fn Key Lockout Vulnerability (Matrix Index 53):** On the stock AULA F75, physical Fn key triggers require a special 4-byte record: `[13, 0, 0, 0]` (`0x0D` key type flag) at byte offset 212 (matrix index 53). Flashing software that treats all 128 slots as standard 1-byte HID codes will write `[0, 0, 0, 0xFF]` to slot 53, destroying the physical Fn key trigger on the firmware level and locking users out of hardware layers and reset combinations.
3. **Firmware Revision Variances:** Multiple hardware revisions and regional firmware variants exist for PID `0x010C`. What is safe on one firmware revision may corrupt registers on another.

---

## Simulator Architecture (`SimulatorTransport`)

The simulator provides a 100% in-memory virtual keyboard controller:
- **Zero USB I/O:** Never calls `navigator.hid.requestDevice()`, `open()`, `sendFeatureReport()`, `sendReport()`, or `receiveFeatureReport()`.
- **Pristine State Representation:** Initializes an exact 1024-byte virtual matrix based on verified factory dumps (`PRISTINE_STAGE5_MATRIX` Table 0 and Table 1).
- **Virtual Remapping:** Standard keys can be safely remapped in RAM. The visualizer and Live Input detector reflect changes in real time.
- **Preview-Only RGB Engine:** Selecting any of the 15 hardware lighting effects, brightness levels, or speeds updates the interactive CSS/SVG preview in the browser without sending USB packets.

---

## Critical Invariant Protection

The application enforces strict gatekeeping via `SafetyPolicy`:
- **Physical Fn Key (Matrix Index 53):** Guarded at the policy level. Any attempt to remap matrix index 53 throws `SafetyViolationError` (`FN_KEY_PROTECTED`).
- **Slot 127 Integrity Check:** Handled conservatively. While slot 127 has no corresponding physical switch on the 80-key layout (and is blocked from key remapping), profile imports conservatively accept both standard zero-padding (`[0x00, 0x00]`) and the disputed marker (`[0x5A, 0xA5]`) without inventing artificial hardware invariants.
- **Slot 0 Escape Check:** All imported profiles must have `[0, 0, 0, 0x29]` at slot 0 to guarantee that the primary Escape key is preserved.
- **Fail-Closed Gatekeeper:** Any opcode not explicitly vetted as a non-mutating query fails closed immediately. All mutating opcodes (`0x03`, `0x04`, `0x05`, `0x06`, `0x08`, `0x0A`, `0x11`) are permanently blocked.

---

## Browser Compatibility & `navigator.hid` Resilience

The web application is designed to be completely resilient:
- **Missing `navigator.hid`:** If the user opens the application in Firefox, Safari, or a mobile browser that lacks the W3C WebHID API, the simulator operates seamlessly without throwing errors.
- **Throwing `navigator.hid` Access:** If `navigator.hid` is configured as a throwing property (e.g., in a sandboxed iframe or restricted environment), the application catches property access gracefully and runs in pure in-memory mode.
- **No Native Dependencies:** Does not require native binaries, Tauri, Rust, privileged system daemons, `sudo` access, or udev rule modifications.

---

## State Model & UI Transparency

The user interface explicitly distinguishes between three states:
1. **Simulated State (RAM):** The active virtual keymap and lighting configuration currently simulated in browser memory.
2. **Saved Profile State:** Persistent configurations stored locally via the versioned Profile Manager (`schemaVersion: 1`).
3. **Physical Hardware State:** Clearly designated as **Disabled** in Milestone 1 via disabled buttons and informative badges.
