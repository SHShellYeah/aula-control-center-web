import test from 'node:test';
import assert from 'node:assert/strict';
import { webhid } from '../services/webhid.ts';
import { SafetyViolationError } from '../safety/SafetyPolicy.ts';

test('WebHIDController: chooser validation accepts approved AULA hardware', () => {
  // Wired USB-C
  assert.doesNotThrow(() => {
    webhid.validateDeviceChooserSelection({ vendorId: 0x258A, productId: 0x010C });
  });

  // 2.4G Wireless Dongle
  assert.doesNotThrow(() => {
    webhid.validateDeviceChooserSelection({ vendorId: 0x3554, productId: 0xFA09 });
  });
});

test('WebHIDController: chooser validation rejects non-AULA devices', () => {
  const invalidDevices = [
    { vendorId: 0x046D, productId: 0xC52B }, // Logitech
    { vendorId: 0x1532, productId: 0x0078 }, // Razer
    { vendorId: 0x0000, productId: 0x0000 },
    { vendorId: 0x258A, productId: 0x9999 }, // Unknown PID on AULA VID
  ];

  for (const dev of invalidDevices) {
    assert.throws(
      () => {
        webhid.validateDeviceChooserSelection(dev);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'DEVICE_VALIDATION_FAILED');
        return true;
      }
    );
  }
});

test('WebHIDController: switches safely to In-Memory Simulator', async () => {
  await webhid.switchToSimulator();
  assert.strictEqual(webhid.activeMode, 'simulation');
  assert.strictEqual(webhid.isSimulated, true);
  assert.strictEqual(webhid.isConnected, true);

  const baseTable = await webhid.readBaseTable();
  assert.strictEqual(baseTable.length, 512);
  assert.strictEqual(baseTable[3], 0x29); // Esc
  assert.strictEqual(baseTable[53 * 4], 0x0D); // Fn
  assert.strictEqual(baseTable[127 * 4 + 2], 0x5A); // Sentinel
  assert.strictEqual(baseTable[127 * 4 + 3], 0xA5);
});

test('WebHIDController: prevents remapping protected Fn key in simulator', async () => {
  await webhid.switchToSimulator();

  await assert.rejects(
    async () => {
      await webhid.writeKeyRemap(53, 0x04);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'FN_KEY_PROTECTED');
      return true;
    }
  );
});

test('WebHIDController: prevents remapping sentinel slot in simulator', async () => {
  await webhid.switchToSimulator();

  await assert.rejects(
    async () => {
      await webhid.writeKeyRemap(127, 0x04);
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'SENTINEL_INDEX_PROTECTED');
      return true;
    }
  );
});

test('WebHIDController: allows remapping standard keys in simulator RAM', async () => {
  await webhid.switchToSimulator();

  // Remap 'A' (matrix index 9) to 'B' (0x05)
  const ok = await webhid.writeKeyRemap(9, 0x05);
  assert.strictEqual(ok, true);

  const baseTable = await webhid.readBaseTable();
  assert.strictEqual(baseTable[9 * 4 + 3], 0x05);
});

test('WebHIDController: fails closed on writes in webhid-readonly mode', async () => {
  // Temporarily simulate webhid-readonly mode state
  (webhid as any).mode = 'webhid-readonly';

  try {
    // 1. writeBaseTable must fail closed
    await assert.rejects(
      async () => {
        await webhid.writeBaseTable(new Uint8Array(512));
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'WRITES_DISABLED');
        return true;
      }
    );

    // 2. writeKeyRemap must fail closed
    await assert.rejects(
      async () => {
        await webhid.writeKeyRemap(9, 0x04);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'WRITES_DISABLED');
        return true;
      }
    );

    // 3. writeKeyRemapRaw must fail closed
    await assert.rejects(
      async () => {
        await webhid.writeKeyRemapRaw(9, [0, 0, 0, 0x04]);
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'WRITES_DISABLED');
        return true;
      }
    );

    // 4. surgicalFnRecovery must fail closed
    await assert.rejects(
      async () => {
        await webhid.surgicalFnRecovery();
      },
      (err: any) => {
        assert(err instanceof SafetyViolationError);
        assert.strictEqual(err.code, 'WRITES_DISABLED');
        return true;
      }
    );
  } finally {
    // Always return to simulation mode
    await webhid.switchToSimulator();
  }
});

test('WebHIDController: getDiagnostics audits HID collections correctly', () => {
  const diagnostics = webhid.getDiagnostics();
  assert(diagnostics.length >= 2);

  const vendorPipe = diagnostics.find((d) => d.isVendorCollection);
  assert(vendorPipe !== undefined);
  assert.strictEqual(vendorPipe.clearanceStatus, 'safe_vendor_pipe');
  assert(vendorPipe.usagePage >= 0xFF00);

  const keyboardPipe = diagnostics.find((d) => d.isProtectedKeyboard);
  assert(keyboardPipe !== undefined);
  assert.strictEqual(keyboardPipe?.clearanceStatus, 'blocked_protected_usage');
  assert.strictEqual(keyboardPipe?.usagePage, 0x0001);
  assert.strictEqual(keyboardPipe?.usage, 0x0006);
});
