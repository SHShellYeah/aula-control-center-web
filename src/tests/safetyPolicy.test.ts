import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SafetyPolicy,
  SafetyViolationError,
  APPROVED_READ_OPCODES,
  BLOCKED_MUTATING_OPCODES,
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
  ESCAPE_MATRIX_INDEX,
} from '../safety/SafetyPolicy.ts';

test('SafetyPolicy: allows approved non-mutating query opcodes', () => {
  for (const [name, opcode] of Object.entries(APPROVED_READ_OPCODES)) {
    assert.doesNotThrow(() => {
      SafetyPolicy.assertCommandAllowed(opcode);
    }, `Opcode ${name} (0x${opcode.toString(16)}) should be allowed`);
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
  // Esc corrupted (not 0x29)
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
  layer[3] = 0x29; // Esc valid
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x00; // Corrupted Fn (not 0x0D)
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
  layer[3] = 0x29; // Esc valid
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x0D; // Fn valid
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0x00; // Zero padding
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0x00;

  assert.doesNotThrow(() => {
    SafetyPolicy.assertLayerPayloadIntegrity(layer);
  });
});

test('SafetyPolicy: rejects layer payload with corrupted non-zero non-sentinel bytes at slot 127', () => {
  const layer = new Uint8Array(512);
  layer[3] = 0x29; // Esc valid
  layer[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x0D; // Fn valid
  layer[LAYER_SENTINEL_INDEX * 4 + 2] = 0xFF; // Corrupted
  layer[LAYER_SENTINEL_INDEX * 4 + 3] = 0xEE;

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
