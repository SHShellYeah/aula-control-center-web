// ============================================================================
// Hardware Safety Policy & Gatekeeper (Fail-Closed)
// Absolute Protection Against Hardware Bricking & Unvalidated Operations
// ============================================================================

export class SafetyViolationError extends Error {
  public readonly code: string;
  constructor(message: string, code: string = 'SAFETY_VIOLATION') {
    super(message);
    this.name = 'SafetyViolationError';
    this.code = code;
  }
}

// Approved Hardware Target (Strictly Wired AULA F75 in this milestone)
export const AULA_WIRED_VID = 0x258A;
export const AULA_WIRED_PID = 0x010C;
export const WIRED_REPORT_ID = 6;
export const WIRED_FRAME_PAYLOAD_LEN = 519; // Payload length without report ID

// Approved Non-Mutating Read Commands (Independently Corroborated for Real Hardware Reads)
export const APPROVED_READ_OPCODES = {
  DEVICE_QUERY: 0x82,      // 14-byte ASCII model / firmware string
  KEYMAP_READ: 0x83,       // 512-byte Table 0 base keymap layer
} as const;

// Deferred Read Commands (Unverified across all firmware revisions; deferred to protect endpoints)
export const DEFERRED_READ_OPCODES = {
  CONFIG_READ: 0x84,       // 128-byte global LED & sleep config (deferred awaiting multi-revision framing audit)
  COLOR_TABLE_READ: 0x8A,  // Macro / color table read (deferred: lacks multi-firmware pcap; risks STALL_PID on 8051)
} as const;

// Mutating / Flash Write Commands (Strictly Blocked in Pure Web Mode)
export const BLOCKED_MUTATING_OPCODES = {
  KEYMAP_WRITE: 0x03,          // Flashes 512-byte keymap layer
  CONFIG_WRITE: 0x04,          // Flashes 128-byte configuration
  MACRO_WRITE: 0x05,           // Flashes macro bytecode sequence
  MACRO_READ: 0x85,            // Macro read buffer
  PER_KEY_LED_WRITE: 0x06,     // Flashes 384-byte per-key LED matrix
  DIRECT_LED_FRAME: 0x08,      // Direct 378-byte RGB frame streaming
  COLOR_TABLE_WRITE: 0x0A,     // Flashes color swatch palette
  RESET_DEVICE: 0x11,          // Triggers factory hardware reset
  WIRELESS_KEYMAP_WRITE: 0x01, // Wireless keymap chunk write
} as const;

export const APPROVED_READ_OPCODE_SET: ReadonlySet<number> = new Set(
  Object.values(APPROVED_READ_OPCODES)
);

export const DEFERRED_READ_OPCODE_SET: ReadonlySet<number> = new Set(
  Object.values(DEFERRED_READ_OPCODES)
);

export const BLOCKED_MUTATING_OPCODE_SET: ReadonlySet<number> = new Set(
  Object.values(BLOCKED_MUTATING_OPCODES)
);

// Hardware Invariants
export const ESCAPE_MATRIX_INDEX = 0;       // Slot 0 holds the Escape key
export const PHYSICAL_FN_MATRIX_INDEX = 53; // Matrix Index 53 connects to physical Fn switch
export const LAYER_SENTINEL_INDEX = 127;    // Slot 127 terminates layer array with 0x5A, 0xA5 or 0x00, 0x00
export const DEFAULT_ESC_KEY_CODE = 0x29;   // HID Usage ID for Keyboard Escape

export class SafetyPolicy {
  /**
   * Evaluates an outbound HID command opcode against the reviewed allowlist.
   * If the command is mutating, deferred, or unrecognized, fails closed immediately before touching transport.
   */
  public static assertCommandAllowed(command: number): void {
    if (BLOCKED_MUTATING_OPCODE_SET.has(command)) {
      throw new SafetyViolationError(
        `Mutating command 0x${command.toString(16).padStart(2, '0').toUpperCase()} is blocked by safety policy. ` +
        `All configuration writes, resets, and macro changes are strictly disabled to protect hardware flash.`,
        'MUTATING_COMMAND_BLOCKED'
      );
    }

    if (DEFERRED_READ_OPCODE_SET.has(command)) {
      throw new SafetyViolationError(
        `Read command 0x${command.toString(16).padStart(2, '0').toUpperCase()} is deferred in this milestone. ` +
        `Only explicitly reviewed queries (0x82 and 0x83) are enabled for hardware transmission.`,
        'DEFERRED_COMMAND_BLOCKED'
      );
    }

    if (!APPROVED_READ_OPCODE_SET.has(command)) {
      throw new SafetyViolationError(
        `Command 0x${command.toString(16).padStart(2, '0').toUpperCase()} failed closed. ` +
        `Only explicitly reviewed non-mutating queries (0x82, 0x83) are permitted to reach physical hardware.`,
        'UNKNOWN_COMMAND_REJECTED'
      );
    }
  }

  /**
   * Restricts hardware access exclusively to the wired AULA F75 (VID 0x258A, PID 0x010C).
   * 2.4GHz wireless dongles and Bluetooth interfaces are rejected in this milestone.
   */
  public static assertWiredDeviceAllowed(vendorId: number, productId: number): void {
    if (vendorId !== AULA_WIRED_VID || productId !== AULA_WIRED_PID) {
      throw new SafetyViolationError(
        `Device (VID 0x${vendorId.toString(16).padStart(4, '0').toUpperCase()}, ` +
        `PID 0x${productId.toString(16).padStart(4, '0').toUpperCase()}) is not an approved wired AULA F75. ` +
        `Wireless dongles (0x3554:0xFA09) and third-party devices are strictly rejected in this milestone.`,
        'DEVICE_NOT_SUPPORTED'
      );
    }
  }

  /**
   * Validates that feature report ID matches the approved wired pipe (Report ID 6).
   */
  public static assertReportIdAllowed(reportId: number): void {
    if (reportId !== WIRED_REPORT_ID) {
      throw new SafetyViolationError(
        `Feature report ID ${reportId} is not approved. Only Report ID ${WIRED_REPORT_ID} is permitted for wired AULA F75 telemetry.`,
        'UNAPPROVED_REPORT_ID'
      );
    }
  }

  /**
   * Validates exact outbound feature report payload length and command byte prior to transmission.
   */
  public static assertOutboundQueryPayload(command: number, payload: Uint8Array): void {
    SafetyPolicy.assertCommandAllowed(command);
    if (payload.length !== WIRED_FRAME_PAYLOAD_LEN) {
      throw new SafetyViolationError(
        `Outbound feature report payload length invalid: expected ${WIRED_FRAME_PAYLOAD_LEN} bytes, got ${payload.length}`,
        'INVALID_QUERY_PAYLOAD_LENGTH'
      );
    }
    if (payload[0] !== command) {
      throw new SafetyViolationError(
        `Payload command byte mismatch: expected 0x${command.toString(16)}, found 0x${payload[0].toString(16)}`,
        'COMMAND_BYTE_MISMATCH'
      );
    }
  }

  /**
   * Enforces immutability of the physical Fn key at Matrix Index 53 and Layer Sentinel at Index 127.
   */
  public static assertKeyRemapAllowed(matrixIndex: number): void {
    if (matrixIndex === PHYSICAL_FN_MATRIX_INDEX) {
      throw new SafetyViolationError(
        `Matrix index ${PHYSICAL_FN_MATRIX_INDEX} (physical Fn key) is strictly protected and immutable. ` +
        `Remapping the physical Fn key would lock the device out of hardware layers and reset hotkeys.`,
        'FN_KEY_PROTECTED'
      );
    }
    if (matrixIndex === LAYER_SENTINEL_INDEX) {
      throw new SafetyViolationError(
        `Matrix index ${LAYER_SENTINEL_INDEX} is reserved for the layer integrity sentinel and cannot be remapped.`,
        'SENTINEL_INDEX_PROTECTED'
      );
    }
    if (matrixIndex < 0 || matrixIndex >= 128) {
      throw new SafetyViolationError(
        `Invalid matrix index ${matrixIndex}: must be within range 0..127`,
        'INDEX_OUT_OF_BOUNDS'
      );
    }
  }

  /**
   * Validates layer payload invariants before acceptance.
   */
  public static assertLayerPayloadIntegrity(layerData: Uint8Array): void {
    if (layerData.length < 512) {
      throw new SafetyViolationError(
        `Layer payload length invalid: expected at least 512 bytes, got ${layerData.length}`,
        'INVALID_LAYER_LENGTH'
      );
    }

    // Esc plausibility gate (slot 0)
    if (layerData[0] !== 0 || layerData[3] !== DEFAULT_ESC_KEY_CODE) {
      throw new SafetyViolationError(
        `Plausibility check failed: Slot 0 does not contain an expected Escape key record (0x29).`,
        'ESC_PLAUSIBILITY_FAILED'
      );
    }

    // Physical Fn key invariant (slot 53)
    const fnOffset = PHYSICAL_FN_MATRIX_INDEX * 4;
    if (layerData[fnOffset] !== 0x0D) {
      throw new SafetyViolationError(
        `Matrix 53 Fn invariant violated: expected keyType 0x0D (13), found 0x${layerData[fnOffset].toString(16)}`,
        'FN_INVARIANT_VIOLATED'
      );
    }

    // Slot 127 conservative integrity check (bytes 508..511):
    const sentOffset = LAYER_SENTINEL_INDEX * 4;
    const sentByte2 = layerData[sentOffset + 2];
    const sentByte3 = layerData[sentOffset + 3];
    const isDisputedSentinel = sentByte2 === 0x5A && sentByte3 === 0xA5;
    const isZeroPadding = sentByte2 === 0x00 && sentByte3 === 0x00;
    if (!isDisputedSentinel && !isZeroPadding) {
      throw new SafetyViolationError(
        `Matrix slot 127 check failed: expected either standard zero-padding [0x00, 0x00] or marker [0x5A, 0xA5] at bytes 510..511, found [0x${sentByte2.toString(16)}, 0x${sentByte3.toString(16)}]`,
        'SENTINEL_INVARIANT_VIOLATED'
      );
    }
  }

  /**
   * Write permission switch: always false in pure web safety mode.
   */
  public static isWriteEnabled(): boolean {
    return false;
  }
}
