import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatorTransport } from '../services/simulatorTransport.ts';
import {
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
  ESCAPE_MATRIX_INDEX,
  SafetyViolationError,
} from '../safety/SafetyPolicy.ts';

test('SimulatorTransport: initializes in-memory without any navigator.hid access', () => {
  // Install strict trap on globalThis.navigator.hid
  let hidAccessed = false;
  try {
    Object.defineProperty(globalThis.navigator, 'hid', {
      configurable: true,
      get() {
        hidAccessed = true;
        throw new Error('VIOLATION: navigator.hid was accessed while in simulator mode!');
      },
    });
  } catch {
    // Navigator trap fallback
  }

  const sim = new SimulatorTransport();
  assert.strictEqual(sim.isSimulated, true);
  assert.strictEqual(sim.queryModel(), 'AULA-F75-SIM1.0');
  assert.strictEqual(hidAccessed, false, 'Simulator must never access navigator.hid');
});

test('SimulatorTransport: maintains pristine hardware invariants on initialization', () => {
  const sim = new SimulatorTransport();
  const layer0 = sim.readBaseTable();

  assert.strictEqual(layer0.length, 512);

  // Esc invariant at index 0
  assert.strictEqual(layer0[ESCAPE_MATRIX_INDEX * 4 + 3], 0x29);

  // Physical Fn invariant at index 53
  const fnOff = PHYSICAL_FN_MATRIX_INDEX * 4;
  assert.strictEqual(layer0[fnOff], 0x0D);
  assert.strictEqual(layer0[fnOff + 1], 0x00);
  assert.strictEqual(layer0[fnOff + 2], 0x00);
  assert.strictEqual(layer0[fnOff + 3], 0x00);

  // Layer sentinel invariant at index 127
  const sentOff = LAYER_SENTINEL_INDEX * 4;
  assert.strictEqual(layer0[sentOff], 0x00);
  assert.strictEqual(layer0[sentOff + 1], 0x00);
  assert.strictEqual(layer0[sentOff + 2], 0x5A);
  assert.strictEqual(layer0[sentOff + 3], 0xA5);
});

test('SimulatorTransport: updates keymap in RAM for non-protected keys', () => {
  const sim = new SimulatorTransport();
  // Remap 'A' (matrix 9) to HID usage 0x05 ('B')
  const ok = sim.updateKeyRemap(9, 0x05);
  assert.strictEqual(ok, true);

  const layer0 = sim.readBaseTable();
  const aOffset = 9 * 4;
  // KeyType 0 (HID Standard) and usage 0x05
  assert.strictEqual(layer0[aOffset], 0x00);
  assert.strictEqual(layer0[aOffset + 3], 0x05);
});

test('SimulatorTransport: blocks remapping physical Fn key (Matrix 53)', () => {
  const sim = new SimulatorTransport();
  assert.throws(
    () => {
      sim.updateKeyRemap(53, 0x04);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'FN_KEY_PROTECTED');
      return true;
    }
  );

  // Verify Fn key byte values remain untouched
  const layer0 = sim.readBaseTable();
  const fnOff = 53 * 4;
  assert.strictEqual(layer0[fnOff], 0x0D);
});

test('SimulatorTransport: blocks remapping layer sentinel slot (Matrix 127)', () => {
  const sim = new SimulatorTransport();
  assert.throws(
    () => {
      sim.updateKeyRemap(127, 0x04);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'SENTINEL_INDEX_PROTECTED');
      return true;
    }
  );

  // Verify sentinel bytes remain intact
  const layer0 = sim.readBaseTable();
  const sentOff = 127 * 4;
  assert.strictEqual(layer0[sentOff + 2], 0x5A);
  assert.strictEqual(layer0[sentOff + 3], 0xA5);
});

test('SimulatorTransport: loadLayer0 validates and rejects corrupt payloads', () => {
  const sim = new SimulatorTransport();
  const corruptLayer = sim.readBaseTable();

  // Corrupt Fn key
  corruptLayer[53 * 4] = 0x00;

  assert.throws(
    () => {
      sim.loadLayer0(corruptLayer);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'FN_INVARIANT_VIOLATED');
      return true;
    }
  );
});

test('SimulatorTransport: updates virtual LED config in RAM', () => {
  const sim = new SimulatorTransport();
  sim.updateConfig(5, 3, 4, 7);

  const cfg = sim.readConfig();
  assert.strictEqual(cfg.length, 128);
  assert.strictEqual(cfg[10], 5); // effect ID
  assert.strictEqual(cfg[126], 0x5A);
  assert.strictEqual(cfg[127], 0xA5);
});
