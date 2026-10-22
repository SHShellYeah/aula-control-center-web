// ============================================================================
// Guarded WebHID Controller & Hardware Safety Gatekeeper
// Strict Fail-Closed Safety: Simulator Default & Read-Only Hardware Telemetry
// ============================================================================

import { parseKeyRecordUsage, type KeyRecord } from '../types/hid.ts';
import { PRISTINE_STAGE5_MATRIX } from './pristineMatrix.ts';
export { PRISTINE_STAGE5_MATRIX };
import {
  SafetyPolicy,
  SafetyViolationError,
  AULA_WIRED_VID,
  AULA_WIRED_PID,
  WIRED_REPORT_ID,
  APPROVED_READ_OPCODES,
  PHYSICAL_FN_MATRIX_INDEX,
} from '../safety/SafetyPolicy.ts';
import { SimulatorTransport } from './simulatorTransport.ts';
import { buildWiredQueryPayload } from '../protocol/framing.ts';
import {
  parseDeviceIdentityResponse,
  parseWiredKeymapResponse,
} from '../protocol/parsers.ts';

export interface DeviceTelemetry {
  modelString: string | null;
  keymapLayer0: Uint8Array | null;
  lastIdentityQueryAt: string | null;
  lastKeymapQueryAt: string | null;
  identityQueryStatus: 'idle' | 'reading' | 'success' | 'error';
  keymapQueryStatus: 'idle' | 'reading' | 'success' | 'error';
  lastError: string | null;
}

export interface WebHIDState {
  isConnected: boolean;
  isSimulated: boolean;
  mode: 'simulation' | 'webhid-readonly';
  deviceName: string;
  vendorId: string;
  productId: string;
  matrixData: Uint8Array | null; // Simulator active matrix in RAM
  records: Map<number, KeyRecord>; // Simulator active records in RAM
  modifiedCount: number;
  logs: string[];
  deviceTelemetry: DeviceTelemetry;
}

export interface DiffEntry {
  offsetHex: string;
  offsetDec: number;
  valA: string;
  valB: string;
  notes: string;
}

export interface InterfaceDiagnostic {
  collectionIndex: number;
  usagePage: number;
  usage: number;
  inputReportsCount: number;
  outputReportsCount: number;
  featureReportsCount: number;
  reportIds: number[];
  isVendorCollection: boolean;
  isProtectedKeyboard: boolean;
  clearanceStatus: 'safe_vendor_pipe' | 'blocked_protected_usage' | 'unrecognized';
}

class WebHIDController {
  private device: any = null;
  private simulator: SimulatorTransport;
  private mode: 'simulation' | 'webhid-readonly' = 'simulation';
  private listeners: ((state: Partial<WebHIDState>) => void)[] = [];
  private logs: string[] = [];
  private connectedBaseline: Uint8Array | null = null;
  private disconnectHandler: ((ev: any) => void) | null = null;

  // Mutex for serializing all device transactions on the USB bus
  private transactionMutex: Promise<void> = Promise.resolve();

  private telemetry: DeviceTelemetry = {
    modelString: null,
    keymapLayer0: null,
    lastIdentityQueryAt: null,
    lastKeymapQueryAt: null,
    identityQueryStatus: 'idle',
    keymapQueryStatus: 'idle',
    lastError: null,
  };

  constructor() {
    this.simulator = new SimulatorTransport();
  }

  public get activeMode(): 'simulation' | 'webhid-readonly' {
    return this.mode;
  }

  public get activeSimulator(): SimulatorTransport {
    return this.simulator;
  }

  public get isConnected(): boolean {
    if (this.mode === 'simulation') return true;
    return this.device !== null && this.device.opened;
  }

  public get isSimulated(): boolean {
    return this.mode === 'simulation';
  }

  public get currentTelemetry(): DeviceTelemetry {
    return { ...this.telemetry };
  }

  public log(msg: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    this.logs.push(logLine);
    console.log(logLine);
    this.notify({ logs: [...this.logs] });
  }

  public subscribe(fn: (state: Partial<WebHIDState>) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify(state: Partial<WebHIDState>): void {
    this.listeners.forEach(fn => fn(state));
  }

  public static isSupported(): boolean {
    try {
      return typeof navigator !== 'undefined' && 'hid' in navigator && (navigator as any).hid !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Serializes all physical device transactions to prevent bus race conditions.
   */
  private async serializeTransaction<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.transactionMutex;
    let resolveNext: () => void = () => {};
    this.transactionMutex = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    try {
      await previous;
      return await action();
    } finally {
      resolveNext();
    }
  }

  /**
   * Switches to 100% In-Memory Simulation Mode.
   * GUARANTEE: Never touches hardware or navigator.hid.
   */
  public async switchToSimulator(): Promise<void> {
    this.cleanupDevice();
    this.mode = 'simulation';
    this.connectedBaseline = null;
    this.log('Switched to In-Memory Simulator Mode (RAM). Zero hardware I/O.');

    this.notify({
      isConnected: true,
      isSimulated: true,
      mode: 'simulation',
      deviceName: 'AULA F75 (Simulator)',
      vendorId: '0x258A',
      productId: '0x010C',
      deviceTelemetry: { ...this.telemetry },
    });

    await this.readMatrixData();
  }

  /**
   * Validates device selection from WebHID chooser.
   * Restricts strictly to wired AULA F75 (VID 0x258A, PID 0x010C).
   */
  public validateDeviceChooserSelection(dev: any): void {
    if (!dev) {
      throw new SafetyViolationError('No device selected.', 'NO_DEVICE');
    }
    SafetyPolicy.assertWiredDeviceAllowed(dev.vendorId, dev.productId);
  }

  /**
   * Audits device HID collections to locate the vendor feature report pipe (Report ID 6).
   * Fails closed if the device lacks the approved vendor collection.
   */
  public validateDeviceCapabilities(dev: any): { valid: boolean; vendorCollection?: any; reason?: string } {
    if (!dev.collections || dev.collections.length === 0) {
      return { valid: false, reason: 'Device provides no HID collection descriptors.' };
    }

    const vendorCol = dev.collections.find((col: any) => {
      const isVendor = col.usagePage >= 0xff00;
      const hasFeatureReport6 = (col.featureReports || []).some((r: any) => r.reportId === WIRED_REPORT_ID);
      return isVendor && hasFeatureReport6;
    });

    if (!vendorCol) {
      return {
        valid: false,
        reason: `Device lacks required vendor collection (usagePage >= 0xFF00) with Feature Report ID ${WIRED_REPORT_ID}.`,
      };
    }

    return { valid: true, vendorCollection: vendorCol };
  }

  /**
   * Connects to Physical Wired AULA F75 Hardware.
   * Strict Safety Boundary:
   * 1. Requires user click (never auto-connects).
   * 2. Filters strictly to wired VID 0x258A / PID 0x010C.
   * 3. Validates capabilities before opening.
   * 4. Does NOT send configuration commands or queries upon connecting.
   */
  public async connect(): Promise<boolean> {
    if (!WebHIDController.isSupported()) {
      const err = 'WebHID API is not supported in this browser. Please use Chrome, Edge, or Brave on Linux/Desktop.';
      this.log(`[Connect Failed] ${err}`);
      throw new Error(err);
    }

    try {
      this.log('[WebHID] Requesting device selection via WebHID chooser (VID: 0x258A, PID: 0x010C)...');
      const hidNav = (navigator as any).hid;
      const devices = await hidNav.requestDevice({
        filters: [{ vendorId: AULA_WIRED_VID, productId: AULA_WIRED_PID }],
      });

      if (!devices || devices.length === 0) {
        this.log('[WebHID] Device selection canceled by user.');
        return false;
      }

      const selected = devices[0];
      this.validateDeviceChooserSelection(selected);

      // Audit collection descriptors for vendor feature report 6
      const capCheck = this.validateDeviceCapabilities(selected);
      if (!capCheck.valid) {
        const errorMsg = `Hardware capability check failed: ${capCheck.reason}`;
        this.log(`[SAFETY BLOCK] ${errorMsg}`);
        throw new SafetyViolationError(errorMsg, 'MISSING_REQUIRED_CAPABILITIES');
      }

      if (!selected.opened) {
        this.log('[WebHID] Opening WebHID interface on wired AULA F75...');
        await selected.open();
      }

      this.device = selected;
      this.mode = 'webhid-readonly';

      // Register disconnect listener
      this.disconnectHandler = (ev: any) => {
        if (ev.device === this.device) {
          this.log('[WebHID] Physical keyboard disconnected.');
          this.handleDisconnect();
        }
      };

      if (hidNav.addEventListener) {
        hidNav.addEventListener('disconnect', this.disconnectHandler);
      }
      if (this.device.addEventListener) {
        this.device.addEventListener('disconnect', this.disconnectHandler);
      }

      const name = this.device.productName || 'AULA F75 (Wired 0x258A:0x010C)';
      this.log(`[WebHID] Connected to ${name}. Hardware mode: READ-ONLY TELEMETRY.`);
      this.log('[WebHID] Zero commands dispatched on connect. Hardware state is completely untouched.');

      this.notify({
        isConnected: true,
        isSimulated: false,
        mode: 'webhid-readonly',
        deviceName: `${name} [Hardware]`,
        vendorId: '0x258A',
        productId: '0x010C',
        deviceTelemetry: { ...this.telemetry },
      });

      return true;
    } catch (err: any) {
      const msg = err.message || String(err);
      this.log(`[WebHID Connection Error] ${msg}`);
      this.cleanupDevice();
      this.mode = 'simulation';
      this.notify({
        isConnected: true,
        isSimulated: true,
        mode: 'simulation',
        deviceName: 'AULA F75 (Simulator)',
        deviceTelemetry: { ...this.telemetry, lastError: msg },
      });
      throw err;
    }
  }

  /**
   * Disconnects from hardware and reverts cleanly to simulator.
   */
  public async disconnect(): Promise<void> {
    this.log('[WebHID] Disconnecting hardware interface...');
    this.cleanupDevice();
    await this.switchToSimulator();
  }

  private handleDisconnect(): void {
    this.cleanupDevice();
    this.mode = 'simulation';
    this.notify({
      isConnected: true,
      isSimulated: true,
      mode: 'simulation',
      deviceName: 'AULA F75 (Simulator)',
      deviceTelemetry: { ...this.telemetry, lastError: 'Device disconnected' },
    });
    this.log('[WebHID] Reverted cleanly to In-Memory Simulator.');
  }

  private cleanupDevice(): void {
    if (this.device && this.device.opened) {
      try {
        this.device.close();
      } catch (err) {
        console.warn('Error closing HID device:', err);
      }
    }
    this.device = null;

    if (this.disconnectHandler && typeof navigator !== 'undefined' && 'hid' in navigator) {
      try {
        (navigator as any).hid.removeEventListener('disconnect', this.disconnectHandler);
      } catch (err) {
        console.warn('Error removing disconnect listener:', err);
      }
      this.disconnectHandler = null;
    }
  }

  /**
   * Queries hardware device model string (CMD 0x82).
   * Safe non-mutating query. Safely handles Linux kernel 14-byte short read.
   * Guaranteed to NOT overwrite simulator profiles.
   */
  public async readDeviceIdentity(): Promise<string> {
    if (this.mode === 'simulation') {
      return this.simulator.queryModel();
    }

    if (!this.device || !this.device.opened) {
      throw new Error('Device not connected or opened.');
    }

    return this.serializeTransaction(async () => {
      this.telemetry.identityQueryStatus = 'reading';
      this.notify({ deviceTelemetry: { ...this.telemetry } });

      try {
        SafetyPolicy.assertCommandAllowed(APPROVED_READ_OPCODES.DEVICE_QUERY);
        SafetyPolicy.assertReportIdAllowed(WIRED_REPORT_ID);

        const query = buildWiredQueryPayload(APPROVED_READ_OPCODES.DEVICE_QUERY, 0, 0);

        this.log('[WebHID] Dispatching approved query: CMD 0x82 (Device Identity)...');
        await this.device.sendFeatureReport(WIRED_REPORT_ID, query);
        await new Promise(r => setTimeout(r, 20));

        const res = await this.device.receiveFeatureReport(WIRED_REPORT_ID);
        const data = new Uint8Array(res.buffer, res.byteOffset, res.byteLength);

        const modelStr = parseDeviceIdentityResponse(data) || 'AULA F75';
        this.telemetry.modelString = modelStr;
        this.telemetry.identityQueryStatus = 'success';
        this.telemetry.lastIdentityQueryAt = new Date().toLocaleTimeString();

        this.log(`[WebHID] CMD 0x82 returned device identity: "${modelStr}"`);

        this.notify({
          deviceName: `${modelStr} [Hardware]`,
          deviceTelemetry: { ...this.telemetry },
        });

        return modelStr;
      } catch (err: any) {
        this.telemetry.identityQueryStatus = 'error';
        this.telemetry.lastError = err.message;
        this.notify({ deviceTelemetry: { ...this.telemetry } });
        this.log(`[WebHID Error] CMD 0x82 failed: ${err.message}`);
        throw err;
      }
    });
  }

  /**
   * Reads 512-byte Table 0 base keymap from hardware (CMD 0x83).
   * Safe non-mutating query. Validates response length and layer payload integrity.
   * Guaranteed to NOT overwrite simulator profiles automatically.
   */
  public async readDeviceKeymap(): Promise<Uint8Array> {
    if (this.mode === 'simulation') {
      return this.simulator.readBaseTable();
    }

    if (!this.device || !this.device.opened) {
      throw new Error('Device not connected or opened.');
    }

    return this.serializeTransaction(async () => {
      this.telemetry.keymapQueryStatus = 'reading';
      this.notify({ deviceTelemetry: { ...this.telemetry } });

      try {
        SafetyPolicy.assertCommandAllowed(APPROVED_READ_OPCODES.KEYMAP_READ);
        SafetyPolicy.assertReportIdAllowed(WIRED_REPORT_ID);

        const query = buildWiredQueryPayload(APPROVED_READ_OPCODES.KEYMAP_READ, 0, 512);

        this.log('[WebHID] Dispatching approved query: CMD 0x83 (Read Keymap Layer 0, 512 bytes)...');
        await this.device.sendFeatureReport(WIRED_REPORT_ID, query);
        await new Promise(r => setTimeout(r, 25));

        const res = await this.device.receiveFeatureReport(WIRED_REPORT_ID);
        const data = new Uint8Array(res.buffer, res.byteOffset, res.byteLength);

        const keymap = parseWiredKeymapResponse(data);

        this.telemetry.keymapLayer0 = new Uint8Array(keymap);
        this.telemetry.keymapQueryStatus = 'success';
        this.telemetry.lastKeymapQueryAt = new Date().toLocaleTimeString();

        this.log(`[WebHID] CMD 0x83 readback successful: 512 bytes received and integrity verified.`);
        this.notify({ deviceTelemetry: { ...this.telemetry } });

        return keymap;
      } catch (err: any) {
        this.telemetry.keymapQueryStatus = 'error';
        this.telemetry.lastError = err.message;
        this.notify({ deviceTelemetry: { ...this.telemetry } });
        this.log(`[WebHID Error] CMD 0x83 failed: ${err.message}`);
        throw err;
      }
    });
  }

  /**
   * Explicit user action to copy read-only device keymap telemetry into the active simulator profile in RAM.
   */
  public importDeviceKeymapToSimulator(): boolean {
    if (!this.telemetry.keymapLayer0) {
      this.log('[Import Error] No device keymap telemetry available to import. Run CMD 0x83 first.');
      return false;
    }

    this.simulator.loadLayer0(this.telemetry.keymapLayer0);
    this.log('[User Action] Device keymap telemetry imported into Simulator RAM. All edits remain strictly virtual.');
    this.readMatrixData();
    return true;
  }

  /**
   * Legacy queryModel compatibility method.
   */
  public async queryModel(): Promise<string> {
    return this.readDeviceIdentity();
  }

  /**
   * Reads base table (routes to simulator in simulation mode; in hardware mode routes to readDeviceKeymap).
   */
  public async readBaseTable(): Promise<Uint8Array> {
    if (this.mode === 'simulation') {
      return this.simulator.readBaseTable();
    }
    return this.readDeviceKeymap();
  }

  /**
   * Flashes 512-byte Table 0 keymap table.
   * STRICTLY BLOCKED in hardware mode; routes to in-memory simulator in simulation mode.
   */
  public async writeBaseTable(table0Data: Uint8Array): Promise<boolean> {
    if (this.mode === 'webhid-readonly') {
      this.log('[SECURITY BLOCK] Hardware keymap flashing is strictly disabled by safety policy.');
      throw new SafetyViolationError(
        'Hardware keymap writes are disabled to protect keyboard flash memory from unvalidated operations.',
        'WRITES_DISABLED'
      );
    }

    SafetyPolicy.assertLayerPayloadIntegrity(table0Data);
    this.simulator.loadLayer0(table0Data);
    this.log('[Simulator] Virtual keymap Layer 0 successfully updated in RAM.');
    await this.readMatrixData();
    return true;
  }

  /**
   * Reads full matrix data in simulator RAM.
   */
  public async readMatrixData(): Promise<Uint8Array | null> {
    try {
      this.log(`Reading keymap data (${this.mode === 'simulation' ? 'Simulator RAM' : 'Hardware Telemetry'})...`);
      const baseTable = await this.readBaseTable();

      if (!this.connectedBaseline) {
        this.connectedBaseline = new Uint8Array(baseTable);
        this.log('Stock baseline reference captured.');
      }

      const records = new Map<number, KeyRecord>();
      let modifiedCount = 0;

      for (let idx = 0; idx < 128; idx++) {
        const offset = idx * 4;
        const bytes: [number, number, number, number] = [
          baseTable[offset],
          baseTable[offset + 1],
          baseTable[offset + 2],
          baseTable[offset + 3],
        ];

        const baselineBytes: [number, number, number, number] = [
          this.connectedBaseline[offset],
          this.connectedBaseline[offset + 1],
          this.connectedBaseline[offset + 2],
          this.connectedBaseline[offset + 3],
        ];

        const hidUsage = parseKeyRecordUsage(bytes);
        const originalUsage = parseKeyRecordUsage(baselineBytes);

        if (bytes[0] !== baselineBytes[0] || bytes[1] !== baselineBytes[1] ||
            bytes[2] !== baselineBytes[2] || bytes[3] !== baselineBytes[3]) {
          modifiedCount++;
        }

        records.set(idx, {
          matrixIdx: idx,
          hidUsage,
          originalUsage,
          bytes,
        });
      }

      const full1024 = new Uint8Array(1024);
      full1024.set(baseTable, 0);
      full1024.set(PRISTINE_STAGE5_MATRIX[1], 512);

      this.notify({
        matrixData: full1024,
        records,
        modifiedCount,
      });

      this.log(`Keymap loaded: 512 bytes parsed. ${modifiedCount} modified key mappings.`);
      return full1024;
    } catch (err: any) {
      this.log(`Read matrix failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Key remap application.
   * In hardware mode: strictly fails closed.
   * In simulator mode: updates virtual matrix in RAM.
   */
  public async writeKeyRemap(matrixIdx: number, newUsage: number): Promise<boolean> {
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);

    if (this.mode === 'webhid-readonly') {
      this.log(`[SECURITY BLOCK] Hardware remap write for matrix #${matrixIdx} blocked by safety policy.`);
      throw new SafetyViolationError(
        'Hardware keymap writes are disabled to protect keyboard flash memory.',
        'WRITES_DISABLED'
      );
    }

    this.simulator.updateKeyRemap(matrixIdx, newUsage);
    this.log(`[Simulator] Remapped Matrix #${matrixIdx} -> HID 0x${newUsage.toString(16)} (Updated in RAM)`);
    await this.readMatrixData();
    return true;
  }

  /**
   * Raw combo key remap application.
   */
  public async writeKeyRemapRaw(matrixIdx: number, rawBytes: [number, number, number, number]): Promise<boolean> {
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);

    if (this.mode === 'webhid-readonly') {
      this.log(`[SECURITY BLOCK] Hardware combo remap for matrix #${matrixIdx} blocked by safety policy.`);
      throw new SafetyViolationError(
        'Hardware combo writes are disabled to protect keyboard flash memory.',
        'WRITES_DISABLED'
      );
    }

    this.simulator.updateKeyRemapRaw(matrixIdx, rawBytes);
    this.log(`[Simulator] Remapped combo Matrix #${matrixIdx} -> [${rawBytes.join(', ')}] (Updated in RAM)`);
    await this.readMatrixData();
    return true;
  }

  /**
   * Surgical Fn Recovery: Restores stock [13, 0, 0, 0] in RAM.
   * Fails closed in hardware mode.
   */
  public async surgicalFnRecovery(): Promise<boolean> {
    if (this.mode === 'webhid-readonly') {
      this.log('[SECURITY BLOCK] Hardware writes are disabled in read-only mode.');
      throw new SafetyViolationError(
        'Hardware writes are disabled to protect keyboard flash memory.',
        'WRITES_DISABLED'
      );
    }

    this.log('=== SURGICAL FN RECOVERY (SIMULATOR) ===');
    const fnOffset = PHYSICAL_FN_MATRIX_INDEX * 4;
    const layer = this.simulator.readBaseTable();
    layer[fnOffset] = 0x0D; // KeyType 13 (Fn)
    layer[fnOffset + 1] = 0x00;
    layer[fnOffset + 2] = 0x00;
    layer[fnOffset + 3] = 0x00;
    this.simulator.loadLayer0(layer);
    this.log(`Restored physical Fn record (Matrix ${PHYSICAL_FN_MATRIX_INDEX} -> [13, 0, 0, 0]) in RAM.`);
    await this.readMatrixData();
    return true;
  }

  /**
   * Enumerates device collections and audits permissions against Chrome Protected Usage filter.
   */
  public getDiagnostics(): InterfaceDiagnostic[] {
    if (this.mode === 'simulation' || !this.device || !this.device.collections) {
      return [
        {
          collectionIndex: 0,
          usagePage: 0xFF00,
          usage: 0x01,
          inputReportsCount: 1,
          outputReportsCount: 1,
          featureReportsCount: 1,
          reportIds: [6],
          isVendorCollection: true,
          isProtectedKeyboard: false,
          clearanceStatus: 'safe_vendor_pipe',
        },
        {
          collectionIndex: 1,
          usagePage: 0x0001,
          usage: 0x06,
          inputReportsCount: 1,
          outputReportsCount: 0,
          featureReportsCount: 0,
          reportIds: [1],
          isVendorCollection: false,
          isProtectedKeyboard: true,
          clearanceStatus: 'blocked_protected_usage',
        },
      ];
    }

    return (this.device.collections || []).map((col: any, idx: number) => {
      const isVendor = col.usagePage >= 0xFF00;
      const isProtected = col.usagePage === 0x0001 && col.usage === 0x0006;
      let clearanceStatus: InterfaceDiagnostic['clearanceStatus'] = 'unrecognized';

      if (isVendor) clearanceStatus = 'safe_vendor_pipe';
      else if (isProtected) clearanceStatus = 'blocked_protected_usage';

      const reportIds: number[] = [];
      (col.inputReports || []).forEach((r: any) => reportIds.push(r.reportId));
      (col.outputReports || []).forEach((r: any) => reportIds.push(r.reportId));
      (col.featureReports || []).forEach((r: any) => reportIds.push(r.reportId));

      return {
        collectionIndex: idx,
        usagePage: col.usagePage,
        usage: col.usage,
        inputReportsCount: col.inputReports?.length || 0,
        outputReportsCount: col.outputReports?.length || 0,
        featureReportsCount: col.featureReports?.length || 0,
        reportIds: Array.from(new Set(reportIds)),
        isVendorCollection: isVendor,
        isProtectedKeyboard: isProtected,
        clearanceStatus,
      };
    });
  }

  public compareDumps(dumpA: Uint8Array, dumpB: Uint8Array): DiffEntry[] {
    const diffs: DiffEntry[] = [];
    const len = Math.min(dumpA.length, dumpB.length);

    for (let i = 0; i < len; i++) {
      if (dumpA[i] !== dumpB[i]) {
        const offsetHex = `0x${i.toString(16).toUpperCase().padStart(3, '0')}`;
        const valA = `0x${dumpA[i].toString(16).toUpperCase().padStart(2, '0')} (${dumpA[i]})`;
        const valB = `0x${dumpB[i].toString(16).toUpperCase().padStart(2, '0')} (${dumpB[i]})`;

        let notes = 'Configuration byte';
        if (i < 512) {
          const matrixIdx = Math.floor(i / 4);
          const byteIdx = i % 4;
          notes = `Table 0 Matrix #${matrixIdx} [Byte ${byteIdx}]`;
        } else {
          const matrixIdx = Math.floor((i - 512) / 4);
          const byteIdx = i % 4;
          notes = `Table 1 Secondary #${matrixIdx} [Byte ${byteIdx}]`;
        }

        diffs.push({
          offsetHex,
          offsetDec: i,
          valA,
          valB,
          notes,
        });
      }
    }
    return diffs;
  }

  public calculateChecksum(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum = (sum + data[i]) >>> 0;
    }
    return sum;
  }
}

export const webhid = new WebHIDController();
