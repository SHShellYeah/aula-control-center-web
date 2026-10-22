import test from 'node:test';
import assert from 'node:assert/strict';
import { webhid } from '../services/webhid.ts';
import { SafetyViolationError, AULA_WIRED_VID, AULA_WIRED_PID } from '../safety/SafetyPolicy.ts';
import { PRISTINE_STAGE5_MATRIX } from '../services/pristineMatrix.ts';

// Helper to construct a mock WebHID device with realistic collections
function createMockDevice(overrides: Partial<any> = {}) {
  const sentReports: Array<{ reportId: number; data: Uint8Array }> = [];
  const eventListeners: Record<string, ((ev: any) => void)[]> = {};

  const validKeymap = new Uint8Array(512);
  validKeymap.set(PRISTINE_STAGE5_MATRIX[0], 0);
  validKeymap[127 * 4 + 2] = 0x5A;
  validKeymap[127 * 4 + 3] = 0xA5;

  const defaultKeymapResponse = new Uint8Array(520);
  defaultKeymapResponse[0] = 6;
  defaultKeymapResponse[1] = 0x83;
  defaultKeymapResponse[6] = 0x00;
  defaultKeymapResponse[7] = 0x02;
  defaultKeymapResponse.set(validKeymap, 8);

  const defaultIdentityResponse = new Uint8Array(520);
  defaultIdentityResponse[0] = 6;
  defaultIdentityResponse[1] = 0x82;
  defaultIdentityResponse.set(new TextEncoder().encode('AULA-F75-TEST-HW'), 8);

  const dev = {
    vendorId: AULA_WIRED_VID,
    productId: AULA_WIRED_PID,
    productName: 'AULA F75 Mechanical Keyboard',
    opened: false,
    collections: [
      {
        usagePage: 0xFF00,
        usage: 0x01,
        featureReports: [{ reportId: 6 }],
      },
      {
        usagePage: 0x0001,
        usage: 0x06,
        featureReports: [],
      },
    ],
    sentReports,
    keymapResponse: defaultKeymapResponse,
    identityResponse: defaultIdentityResponse,
    open: async function () {
      dev.opened = true;
    },
    close: async function () {
      dev.opened = false;
    },
    sendFeatureReport: async function (reportId: number, data: Uint8Array) {
      sentReports.push({ reportId, data: new Uint8Array(data) });
    },
    receiveFeatureReport: async function (reportId: number) {
      if (reportId !== 6) throw new Error(`Invalid reportId ${reportId}`);
      // Return response based on last sent report opcode
      const last = sentReports[sentReports.length - 1];
      if (last && last.data[0] === 0x82) {
        return new DataView(dev.identityResponse.buffer, dev.identityResponse.byteOffset, dev.identityResponse.byteLength);
      }
      return new DataView(dev.keymapResponse.buffer, dev.keymapResponse.byteOffset, dev.keymapResponse.byteLength);
    },
    addEventListener: function (type: string, listener: (ev: any) => void) {
      if (!eventListeners[type]) eventListeners[type] = [];
      eventListeners[type].push(listener);
    },
    removeEventListener: function (type: string, listener: (ev: any) => void) {
      if (eventListeners[type]) {
        eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
      }
    },
    triggerEvent: function (type: string, ev: any) {
      (eventListeners[type] || []).forEach((l) => l(ev));
    },
    ...overrides,
  };

  return dev;
}

test('WebHIDController: chooser validation accepts ONLY wired AULA F75', () => {
  // Wired USB-C (0x258A:0x010C)
  assert.doesNotThrow(() => {
    webhid.validateDeviceChooserSelection({ vendorId: 0x258A, productId: 0x010C });
  });

  // 2.4G Wireless Dongle (0x3554:0xFA09) must be REJECTED in this milestone
  assert.throws(
    () => {
      webhid.validateDeviceChooserSelection({ vendorId: 0x3554, productId: 0xFA09 });
    },
    (err: any) => {
      assert(err instanceof SafetyViolationError);
      assert.strictEqual(err.code, 'DEVICE_NOT_SUPPORTED');
      return true;
    }
  );

  // Non-AULA devices rejected
  const invalidDevices = [
    { vendorId: 0x046D, productId: 0xC52B },
    { vendorId: 0x1532, productId: 0x0078 },
    { vendorId: 0x258A, productId: 0x9999 },
  ];

  for (const dev of invalidDevices) {
    assert.throws(() => webhid.validateDeviceChooserSelection(dev));
  }
});

test('WebHIDController: capability audit verifies vendor feature report ID 6 pipe', () => {
  // Valid device with vendor collection containing feature report 6
  const validDev = createMockDevice();
  const resValid = webhid.validateDeviceCapabilities(validDev);
  assert.strictEqual(resValid.valid, true);
  assert(resValid.vendorCollection !== undefined);

  // Device with only standard keyboard collection (no vendor collection)
  const keyboardOnlyDev = createMockDevice({
    collections: [
      {
        usagePage: 0x0001,
        usage: 0x06,
        featureReports: [],
      },
    ],
  });
  const resKbOnly = webhid.validateDeviceCapabilities(keyboardOnlyDev);
  assert.strictEqual(resKbOnly.valid, false);
  assert.match(resKbOnly.reason!, /lacks required vendor collection/);

  // Device with vendor collection but missing feature report ID 6
  const wrongReportDev = createMockDevice({
    collections: [
      {
        usagePage: 0xFF00,
        usage: 0x01,
        featureReports: [{ reportId: 1 }], // Not 6
      },
    ],
  });
  const resWrong = webhid.validateDeviceCapabilities(wrongReportDev);
  assert.strictEqual(resWrong.valid, false);
});

test('WebHIDController: user-initiated connect opens device without sending any command', async () => {
  const mockDev = createMockDevice();
  let requestedFilters: any = null;

  // Mock navigator.hid
  const mockHid = {
    requestDevice: async (opts: any) => {
      requestedFilters = opts.filters;
      return [mockDev];
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    const success = await webhid.connect();
    assert.strictEqual(success, true);

    // Verify filter strictly target wired AULA F75
    assert.deepStrictEqual(requestedFilters, [{ vendorId: 0x258A, productId: 0x010C }]);

    // Device opened
    assert.strictEqual(mockDev.opened, true);
    assert.strictEqual(webhid.activeMode, 'webhid-readonly');
    assert.strictEqual(webhid.isConnected, true);
    assert.strictEqual(webhid.isSimulated, false);

    // ZERO commands transmitted merely because device connected
    assert.strictEqual(mockDev.sentReports.length, 0);
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: readDeviceIdentity executes CMD 0x82 with exact framing and updates telemetry', async () => {
  const mockDev = createMockDevice();
  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();
    assert.strictEqual(mockDev.sentReports.length, 0);

    const model = await webhid.readDeviceIdentity();
    assert.strictEqual(model, 'AULA-F75-TEST-HW');

    // Verify exact request bytes
    assert.strictEqual(mockDev.sentReports.length, 1);
    const sent = mockDev.sentReports[0];
    assert.strictEqual(sent.reportId, 6);
    assert.strictEqual(sent.data.length, 519);
    assert.strictEqual(sent.data[0], 0x82); // CMD 0x82
    assert.strictEqual(sent.data[1], 0x00);
    assert.strictEqual(sent.data[3], 0x01); // 1 packet

    // Verify telemetry state updated
    const telemetry = webhid.currentTelemetry;
    assert.strictEqual(telemetry.modelString, 'AULA-F75-TEST-HW');
    assert.strictEqual(telemetry.identityQueryStatus, 'success');
    assert(telemetry.lastIdentityQueryAt !== null);

    // Verify simulator active matrix was NOT touched
    const base = await webhid.activeSimulator.readBaseTable();
    assert.strictEqual(base[3], 0x29); // pristine Esc
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: readDeviceKeymap executes CMD 0x83 with exact framing and layer integrity check', async () => {
  const mockDev = createMockDevice();
  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();

    const keymap = await webhid.readDeviceKeymap();
    assert.strictEqual(keymap.length, 512);

    // Verify sent frame
    assert.strictEqual(mockDev.sentReports.length, 1);
    const sent = mockDev.sentReports[0];
    assert.strictEqual(sent.reportId, 6);
    assert.strictEqual(sent.data.length, 519);
    assert.strictEqual(sent.data[0], 0x83); // CMD 0x83
    assert.strictEqual(sent.data[5], 0x00); // 512 bytes length
    assert.strictEqual(sent.data[6], 0x02);

    // Verify telemetry state updated
    const telemetry = webhid.currentTelemetry;
    assert(telemetry.keymapLayer0 !== null);
    assert.strictEqual(telemetry.keymapLayer0.length, 512);
    assert.strictEqual(telemetry.keymapQueryStatus, 'success');
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: importDeviceKeymapToSimulator updates simulator RAM only when explicitly called', async () => {
  const mockDev = createMockDevice();
  // Modify key in mock device keymap to test import: Matrix index 9 ('A') -> 0x05 ('B')
  mockDev.keymapResponse[8 + 9 * 4 + 3] = 0x05;

  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();
    await webhid.readDeviceKeymap();

    // Verify simulator RAM does NOT have 'B' before import
    let simBase = webhid.activeSimulator.readBaseTable();
    assert.strictEqual(simBase[9 * 4 + 3], 0x04); // still stock 'A' (0x04)

    // User explicitly triggers import
    const imported = webhid.importDeviceKeymapToSimulator();
    assert.strictEqual(imported, true);

    // Now simulator RAM has updated keymap
    simBase = webhid.activeSimulator.readBaseTable();
    assert.strictEqual(simBase[9 * 4 + 3], 0x05);
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: serializes concurrent transactions on the USB pipe', async () => {
  const executionOrder: string[] = [];

  const mockDev = createMockDevice({
    sendFeatureReport: async (_reportId: number, data: Uint8Array) => {
      const op = data[0] === 0x82 ? 'identity' : 'keymap';
      executionOrder.push(`start-${op}`);
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(`end-${op}`);
    },
  });

  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();

    // Launch identity and keymap reads concurrently
    await Promise.all([
      webhid.readDeviceIdentity(),
      webhid.readDeviceKeymap(),
    ]);

    // Mutex must serialize: identity must finish completely before keymap starts
    assert.deepStrictEqual(executionOrder, [
      'start-identity',
      'end-identity',
      'start-keymap',
      'end-keymap',
    ]);
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: device disconnection cleans up and reverts to simulator', async () => {
  const mockDev = createMockDevice();
  let disconnectCallback: any = null;

  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: (type: string, fn: any) => {
      if (type === 'disconnect') disconnectCallback = fn;
    },
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();
    assert.strictEqual(webhid.activeMode, 'webhid-readonly');
    assert.strictEqual(mockDev.opened, true);

    // Trigger physical unplug event
    assert(disconnectCallback !== null);
    disconnectCallback({ device: mockDev });

    // Controller should cleanly reset to simulator
    assert.strictEqual(webhid.activeMode, 'simulation');
    assert.strictEqual(webhid.isSimulated, true);
    assert.strictEqual(mockDev.opened, false);
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: fails closed on writes in webhid-readonly mode', async () => {
  const mockDev = createMockDevice();
  const mockHid = {
    requestDevice: async () => [mockDev],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const origNav = (globalThis as any).navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, hid: mockHid },
    configurable: true,
  });

  try {
    await webhid.connect();
    assert.strictEqual(webhid.activeMode, 'webhid-readonly');

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

    // Zero write reports sent to device
    assert.strictEqual(mockDev.sentReports.length, 0);
  } finally {
    await webhid.switchToSimulator();
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true });
  }
});

test('WebHIDController: getDiagnostics audits HID collections correctly', () => {
  const diagnostics = webhid.getDiagnostics();
  assert(diagnostics.length >= 2);

  const vendorPipe = diagnostics.find((d) => d.isVendorCollection);
  assert(vendorPipe !== undefined);
  assert.strictEqual(vendorPipe.clearanceStatus, 'safe_vendor_pipe');
  assert(vendorPipe.usagePage >= 0xFF00);

  const protectedKb = diagnostics.find((d) => d.isProtectedKeyboard);
  assert(protectedKb !== undefined);
  assert.strictEqual(protectedKb.clearanceStatus, 'blocked_protected_usage');
  assert.strictEqual(protectedKb.usagePage, 0x0001);
  assert.strictEqual(protectedKb.usage, 0x0006);
});
