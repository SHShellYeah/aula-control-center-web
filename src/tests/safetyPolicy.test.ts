import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SafetyPolicy,
  SafetyViolationError,
  APPROVED_READ_OPCODES,
  DEFERRED_READ_OPCODES,
  BLOCKED_MUTATING_OPCODES,
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
  ESCAPE_MATRIX_INDEX,
  AULA_WIRED_VID,
  AULA_WIRED_PID,
  WIRED_REPORT_ID,
  WIRED_FRAME_PAYLOAD_LEN,
} from '../safety/SafetyPolicy.ts';

test('SafetyPolicy: allows approved non-mutating query opcodes (0x82, 0x83)', () => {
  assert.strictEqual(Object.keys(APPROVED_READ_OPCODES).length, 2);
  for (const [name, opcode] of Object.entries(APPROVED_READ_OPCODES)) {
    assert.doesNotThrow(() => {
      SafetyPolicy.assertCommandAllowed(opcode);
    }, `Opcode ${name} (0x${opcode.toString(16)}) should be allowed`);
  }
});

test('SafetyPolicy: blocks deferred read opcodes (0x84, 0x8A)', () => {
  for (const [name, opcode] of Object.entries(DEFERRED_READ_OPCODES)) {
    assert.throws(
      () => {
        SafetyPolicy.assertCommandAllowed(opcode);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'DEFERRED_COMMAND_BLOCKED');
        return true;
      },
      `Deferred opcode ${name} (0x${opcode.toString(16)}) must be blocked in this milestone`
    );
  }
});

test('SafetyPolicy: blocks all known mutating opcodes', () => {
  for (const [name, opcode] of Object.entries(BLOCKED_MUTATING_OPCODES)) {
    assert.throws(
      () => {
        SafetyPolicy.assertCommandAllowed(opcode);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'MUTATING_COMMAND_BLOCKED');
        return true;
      },
      `Mutating opcode ${name} (0x${opcode.toString(16)}) must be blocked`
    );
  }
});

test('SafetyPolicy: fails closed on unknown or arbitrary opcodes', () => {
  const unknownOpcodes = [0x00, 0x12, 0x20, 0x55, 0x7F, 0x99, 0xEE, 0xFF];
  for (const op of unknownOpcodes) {
    assert.throws(
      () => {
        SafetyPolicy.assertCommandAllowed(op);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'UNKNOWN_COMMAND_REJECTED');
        return true;
      },
      `Unknown opcode 0x${op.toString(16)} must fail closed`
    );
  }
});

test('SafetyPolicy: asserts wired AULA F75 device filtering', () => {
  // Approved wired F75
  assert.doesNotThrow(() => {
    SafetyPolicy.assertWiredDeviceAllowed(AULA_WIRED_VID, AULA_WIRED_PID);
  });

  // Rejected: 2.4G wireless dongle (0x3554:0xFA09)
  assert.throws(
    () => {
      SafetyPolicy.assertWiredDeviceAllowed(0x3554, 0xFA09);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'DEVICE_NOT_SUPPORTED');
      return true;
    }
  );

  // Rejected: Bluetooth interface or other PIDs
  assert.throws(() => SafetyPolicy.assertWiredDeviceAllowed(0x248A, 0x010C));
  assert.throws(() => SafetyPolicy.assertWiredDeviceAllowed(0x258A, 0x9999));
  assert.throws(() => SafetyPolicy.assertWiredDeviceAllowed(0x046D, 0xC52B));
});

test('SafetyPolicy: asserts feature report ID validation', () => {
  assert.doesNotThrow(() => {
    SafetyPolicy.assertReportIdAllowed(WIRED_REPORT_ID);
  });

  const unapprovedReportIds = [0, 1, 2, 5, 7, 19, 0xFF];
  for (const rId of unapprovedReportIds) {
    assert.throws(
      () => {
        SafetyPolicy.assertReportIdAllowed(rId);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'UNAPPROVED_REPORT_ID');
        return true;
      }
    );
  }
});

test('SafetyPolicy: validates outbound query payload length and command byte', () => {
  const valid82 = new Uint8Array(WIRED_FRAME_PAYLOAD_LEN);
  valid82[0] = 0x82;
  assert.doesNotThrow(() => {
    SafetyPolicy.assertOutboundQueryPayload(0x82, valid82);
  });

  const valid83 = new Uint8Array(WIRED_FRAME_PAYLOAD_LEN);
  valid83[0] = 0x83;
  assert.doesNotThrow(() => {
    SafetyPolicy.assertOutboundQueryPayload(0x83, valid83);
  });

  // Wrong length
  const shortPayload = new Uint8Array(64);
  shortPayload[0] = 0x82;
  assert.throws(
    () => SafetyPolicy.assertOutboundQueryPayload(0x82, shortPayload),
    (err: any) => err.code === 'INVALID_QUERY_PAYLOAD_LENGTH'
  );

  // Command byte mismatch
  const mismatched = new Uint8Array(WIRED_FRAME_PAYLOAD_LEN);
  mismatched[0] = 0x83;
  assert.throws(
    () => SafetyPolicy.assertOutboundQueryPayload(0x82, mismatched),
    (err: any) => err.code === 'COMMAND_BYTE_MISMATCH'
  );
});

test('SafetyPolicy: protects physical Fn key (Matrix Index 53)', () => {
  assert.strictEqual(PHYSICAL_FN_MATRIX_INDEX, 53);
  assert.throws(
    () => {
      SafetyPolicy.assertKeyRemapAllowed(53);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'FN_KEY_PROTECTED');
      return true;
    }
  );
});

test('SafetyPolicy: protects layer sentinel slot (Matrix Index 127)', () => {
  assert.strictEqual(LAYER_SENTINEL_INDEX, 127);
  assert.throws(
    () => {
      SafetyPolicy.assertKeyRemapAllowed(127);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'SENTINEL_INDEX_PROTECTED');
      return true;
    }
  );
});

test('SafetyPolicy: permits remapping regular non-protected keys', () => {
  const regularKeys = [0, 1, 9, 10, 11, 17, 25, 52, 54, 126];
  for (const idx of regularKeys) {
    assert.doesNotThrow(() => {
      SafetyPolicy.assertKeyRemapAllowed(idx);
    }, `Key ${idx} should be permitted to remap`);
  }
});

test('SafetyPolicy: rejects out-of-range matrix indices', () => {
  const invalidIndices = [-1, 128, 255, 999];
  for (const idx of invalidIndices) {
    assert.throws(() => {
      SafetyPolicy.assertKeyRemapAllowed(idx);
    });
  }
});

test('SafetyPolicy: validates layer payload integrity on valid pristine layer', () => {
  const validLayer = new Uint8Array(512);
  validLayer[ESCAPE_MATRIX_INDEX * 4 + 3] = 0x29; // Esc

  const fnOff = PHYSICAL_FN_MATRIX_INDEX * 4;
  validLayer[fnOff] = 0x0D; // Fn key type
  validLayer[fnOff + 1] = 0x00;
  validLayer[fnOff + 2] = 0x00;
  validLayer[fnOff + 3] = 0x00;

  const sentOff = LAYER_SENTINEL_INDEX * 4;
  validLayer[sentOff] = 0x00;
  validLayer[sentOff + 1] = 0x00;
  validLayer[sentOff + 2] = 0x5A;
  validLayer[sentOff + 3] = 0xA5;

  assert.doesNotThrow(() => {
    SafetyPolicy.assertLayerPayloadIntegrity(validLayer);
  });
});

test('SafetyPolicy: rejects layer payload with invalid size', () => {
  const shortLayer = new Uint8Array(256);
  assert.throws(
    () => {
      SafetyPolicy.assertLayerPayloadIntegrity(shortLayer);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'INVALID_LAYER_LENGTH');
      return true;
    }
  );
});

test('SafetyPolicy: rejects layer payload with corrupted Escape key', () => {
  const layer = new Uint8Array(512);
  layer[3] = 0x04; // 'A' instead of Escape
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x0D;
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0x5A;
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0xA5;

  assert.throws(
    () => {
      SafetyPolicy.assertLayerPayloadIntegrity(layer);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'ESC_PLAUSIBILITY_FAILED');
      return true;
    }
  );
});

test('SafetyPolicy: rejects layer payload with corrupted Fn key', () => {
  const layer = new Uint8Array(512);
  layer[3] = 0x29; // Esc ok
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x04; // Corrupted Fn key type
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0x5A;
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0xA5;

  assert.throws(
    () => {
      SafetyPolicy.assertLayerPayloadIntegrity(layer);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'FN_INVARIANT_VIOLATED');
      return true;
    }
  );
});

test('SafetyPolicy: accepts layer payload with conservative zero-padding at slot 127', () => {
  const layer = new Uint8Array(512);
  layer[3] = 0x29; // Esc ok
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x0D; // Fn ok
  // Slot 127 zero padding (bytes 510..511 == 0, 0)
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0x00;
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0x00;

  assert.doesNotThrow(() => {
    SafetyPolicy.assertLayerPayloadIntegrity(layer);
  });
});

test('SafetyPolicy: rejects layer payload with corrupted non-zero non-sentinel bytes at slot 127', () => {
  const layer = new Uint8Array(512);
  layer[3] = 0x29; // Esc ok
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x0D; // Fn ok
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0x12; // Corrupted byte
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0x34;

  assert.throws(
    () => {
      SafetyPolicy.assertLayerPayloadIntegrity(layer);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'SENTINEL_INVARIANT_VIOLATED');
      return true;
    }
  );
});
