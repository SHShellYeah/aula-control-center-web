import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatorTransport } from '../services/simulatorTransport.ts';
import { webhid } from '../services/webhid.ts';
import {
  SafetyPolicy,
  SafetyViolationError,
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
} from '../safety/SafetyPolicy.ts';

test('SimulatorWorkflow: operates completely in memory when navigator.hid is absent', () => {
  const originalHid = (globalThis.navigator as any)?.hid;
  try {
    // Explicitly delete or set hid to undefined
    Object.defineProperty(globalThis.navigator, 'hid', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const sim = new SimulatorTransport();
    assert.strictEqual(sim.isSimulated, true);

    // Read initial base table
    const baseTable = sim.readBaseTable();
    assert.strictEqual(baseTable.length, 512);
    assert.strictEqual(baseTable[3], 0x29); // Esc
    assert.strictEqual(baseTable[PHYSICAL_FN_MATRIX_INDEX * 4], 0x0D); // Fn

    // Ordinary key remap ('A' -> 'X')
    const remapOk = sim.updateKeyRemap(9, 0x1B);
    assert.strictEqual(remapOk, true);
    assert.strictEqual(sim.readBaseTable()[9 * 4 + 3], 0x1B);

    // Protected Fn key remap blocked
    assert.throws(
      () => sim.updateKeyRemap(PHYSICAL_FN_MATRIX_INDEX, 0x04),
      (err: any) => err instanceof SafetyViolationError && err.code === 'FN_KEY_PROTECTED'
    );

    // Protected slot 127 blocked
    assert.throws(
      () => sim.updateKeyRemap(LAYER_SENTINEL_INDEX, 0x04),
      (err: any) => err instanceof SafetyViolationError && err.code === 'SENTINEL_INDEX_PROTECTED'
    );
  } finally {
    if (originalHid !== undefined) {
      Object.defineProperty(globalThis.navigator, 'hid', {
        value: originalHid,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis.navigator as any).hid;
    }
  }
});

test('SimulatorWorkflow: operates completely in memory even when navigator.hid throws on access', () => {
  const originalHid = (globalThis.navigator as any)?.hid;
  try {
    // Deliberately make navigator.hid throw an error on property access
    Object.defineProperty(globalThis.navigator, 'hid', {
      get() {
        throw new Error('Access to navigator.hid is strictly blocked');
      },
      configurable: true,
    });

    // isSupported() must safely catch the throw and return false without crashing
    const supported = (webhid.constructor as any).isSupported();
    assert.strictEqual(supported, false);

    // Simulator flows must continue without crashing
    const sim = new SimulatorTransport();
    assert.strictEqual(sim.queryModel(), 'AULA-F75-SIM1.0');
    assert.strictEqual(sim.readBaseTable().length, 512);
  } finally {
    if (originalHid !== undefined) {
      Object.defineProperty(globalThis.navigator, 'hid', {
        value: originalHid,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis.navigator as any).hid;
    }
  }
});

test('SimulatorWorkflow: webhid.connect() is disabled and fails closed in Milestone 1', async () => {
  // connect() must return false without calling navigator.hid.requestDevice()
  const connected = await webhid.connect();
  assert.strictEqual(connected, false);
  assert.strictEqual(webhid.activeMode, 'simulation');
  assert.strictEqual(webhid.isSimulated, true);
});

test('SimulatorWorkflow: unknown and mutating hardware commands remain blocked fail-closed', () => {
  // Unreviewed / unknown commands fail closed
  const unknownOpcode = 0x99;
  assert.throws(
    () => SafetyPolicy.assertCommandAllowed(unknownOpcode),
    (err: any) => err instanceof SafetyViolationError && err.code === 'UNKNOWN_COMMAND_REJECTED'
  );

  // Mutating opcodes fail closed
  const mutatingOpcode = 0x03; // Keymap flash write
  assert.throws(
    () => SafetyPolicy.assertCommandAllowed(mutatingOpcode),
    (err: any) => err instanceof SafetyViolationError && err.code === 'MUTATING_COMMAND_BLOCKED'
  );

  // Hardware reset opcode fails closed
  const resetOpcode = 0x11;
  assert.throws(
    () => SafetyPolicy.assertCommandAllowed(resetOpcode),
    (err: any) => err instanceof SafetyViolationError && err.code === 'MUTATING_COMMAND_BLOCKED'
  );
});
