# Guarded WebHID Read-Only Hardware Mode

## 1. Scope & Supported Hardware

In this milestone, hardware access is strictly limited to the **Wired AULA F75**:
- **Vendor ID (VID):** `0x258A`
- **Product ID (PID):** `0x010C`
- **Transport:** Direct USB Type-C Cable

### Explicitly Unsupported Transports:
- **2.4 GHz Wireless Dongle** (`VID 0x3554, PID 0xFA09`): **Disabled**. Requires 20-byte fragmented interrupt packet framing and longitudinal checksum calculation; attempting 520-byte feature reports on wireless dongles causes packet drops.
- **Bluetooth** (`VID 0x248A` / BLE): **Disabled**. Standard OS Bluetooth HID drivers do not expose the required vendor control pipe to WebHID.

---

## 2. Safety Architecture & Operational Separation

The application maintains a strict separation between **In-Memory Simulator State** and **Physical Hardware Telemetry**:

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

### Key Safety Guarantees:
1. **User Gesture Required:** The browser's WebHID device picker is never triggered automatically. Physical hardware is never accessed on page load or during background polling.
2. **Capability Clearance:** Prior to opening, the keyboard's HID collection descriptors are audited. The device must expose a vendor-defined collection (`usagePage >= 0xFF00`) with Feature Report ID `6`. If missing or if only protected keyboard usage (`0x0001:0x0006`) is present, connection fails closed.
3. **Zero Commands on Connect:** Selecting and opening the keyboard does not dispatch any feature reports. Connecting merely opens the pipe and registers disconnect handlers.
4. **State Isolation:** Hardware reads are stored in a dedicated `deviceTelemetry` structure. They **never silently overwrite** active simulator profiles. An explicit "Import to Simulator" button allows the user to copy readback data into RAM for virtual testing.
5. **Transaction Mutex:** All feature report transmissions and receptions are serialized through a promise-based mutex to prevent packet interleaving on the USB endpoint.
6. **All Configuration Writes Disabled:** Flash flashing (`0x03`), configuration writes (`0x04`), macro writes (`0x05`), LED flashing (`0x06`), live streaming (`0x08`), and hardware resets (`0x11`) are strictly intercepted and blocked by `SafetyPolicy.ts`.

---

## 3. Approved Query Opcodes & Evidence

| Opcode | Function | Request Framing | Expected Response | Status |
|---|---|---|---|---|
| `0x82` | **Device Identity Query** | 519-byte report: `[0x82, 0, 0, 1, 0, 0, 0, ...]` | 14-byte ASCII model string (e.g. `AULA-F75-V1.0`). Safely handles Linux `HIDIOCGFEATURE` short buffers. | **Enabled & Tested** |
| `0x83` | **Keymap Layer 0 Read** | 519-byte report: `[0x83, 0, 0, 1, 0, 0, 2, ...]` | 512-byte Table 0 dump. Validates Esc (`0x29`), Fn (`0x0D`), and slot 127 sentinel integrity. | **Enabled & Tested** |
| `0x84` | **Config & LED Read** | 519-byte report: `[0x84, 0, 0, 1, 0, ...]` | 128-byte global LED/sleep config. | **Deferred** (Awaiting multi-firmware framing audit) |
| `0x8A` | **Color Table / Macro Read** | 519-byte report: `[0x8A, ...]` | Color swatch buffer. | **Deferred** (Lacks multi-firmware pcap; risks `STALL_PID` on 8051) |

---

## 4. Residual Risks & Technical Uncertainty

While read-only queries do not wear or modify flash memory, users should be aware of residual hardware risks:
- **MCU Endpoint Stalling:** On 8051-based USB microcontrollers (such as Sinowealth SH68F90A), unexpected or malformed feature reports can trigger an endpoint stall condition (`STALL_PID`), requiring physical cable re-plugging.
- **Kernel Quirk Variations:** Under Linux, differing kernel versions handle `HIDIOCGFEATURE` feature report sizes differently. The application safely handles both 14-byte short buffers and 520-byte padded frames.
- **Concurrent Software Conflicts:** If official AULA software or third-party HID daemons are running concurrently on the host system, feature report access may be contested or denied by the OS. Close other software before connecting.

---

## 5. Manual Hardware Testing Guide

Follow these steps to safely test read-only hardware support with a physical AULA F75:

1. **Connect Keyboard via USB Cable:**
   - Plug the keyboard directly into your computer via USB Type-C cable.
   - Set the physical mode switch on the back of the keyboard to **USB / Wired** mode.
   - Close any proprietary AULA desktop software or background daemons.
2. **Launch Application in Chromium Browser:**
   - Open the web application in Google Chrome, Microsoft Edge, or Brave.
   - Notice the initial state: **Simulator Mode (RAM)** is active by default. Zero USB traffic has occurred.
3. **Initiate WebHID Connection:**
   - Click the green **"Connect Wired F75"** button in the sidebar or Overview tab.
   - The browser chooser modal will appear, filtered to `0x258A:0x010C`.
   - Select your AULA F75 and click **Connect**.
4. **Inspect Connection State:**
   - Header badge changes to **"Hardware Read-Only (0x258A:0x010C)"**.
   - Notice that **zero packets** were transmitted on connect. Hardware remains untouched.
5. **Execute Read Queries:**
   - Click **"Execute Query CMD 0x82"**: Reads device model string. The app displays the decoded ASCII model string and timestamp.
   - Click **"Read Keymap CMD 0x83"**: Reads the 512-byte Table 0 keymap from physical hardware and validates payload integrity.
6. **(Optional) Test Remapping in Simulator:**
   - Click **"Import to Simulator"** to load the physical keymap into the in-memory simulator.
   - Remap keys virtually without touching keyboard flash memory.
7. **Disconnect Safely:**
   - Click **"Disconnect to Simulator"** at any time to close the WebHID interface and return to simulator mode.
