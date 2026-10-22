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
  APPROVED_READ_OPCODES,
  PHYSICAL_FN_MATRIX_INDEX,
} from '../safety/SafetyPolicy.ts';
import { SimulatorTransport } from './simulatorTransport.ts';

export interface WebHIDState {
  isConnected: boolean;
  isSimulated: boolean;
  mode: 'simulation' | 'webhid-readonly';
  deviceName: string;
  vendorId: string;
  productId: string;
  matrixData: Uint8Array | null;
  records: Map<number, KeyRecord>;
  modifiedCount: number;
  logs: string[];
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
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /**
   * Switches to 100% In-Memory Simulation Mode.
   * GUARANTEE: Never touches hardware or navigator.hid.
   */
  public async switchToSimulator(): Promise<void> {
    if (this.device && this.device.opened) {
      try {
        await this.device.close();
      } catch (e) {
        console.warn('Error closing device during switch to simulator:', e);
      }
    }
    this.device = null;
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
    });

    await this.readMatrixData();
  }

  /**
   * Connects to Physical Hardware in STRICT READ-ONLY MODE.
   * Must be called from a user gesture (button click).
   */
  public async connect(): Promise<boolean> {
    if (!WebHIDController.isSupported()) {
      this.log('WebHID is not supported in this browser. Please use Chrome, Edge, or Brave.');
      alert('WebHID is not supported in this browser. Please use a Chromium-based browser (Chrome, Edge, Brave).');
      return false;
    }

    try {
      const hidNav = (navigator as any).hid;
      this.log('Requesting WebHID device chooser (VID: 0x258A, PID: 0x010C)...');

      // Request device with strict hardware filters
      const devices = await hidNav.requestDevice({
        filters: [
          { vendorId: 0x258A, productId: 0x010C }, // Wired USB-C
          { vendorId: 0x3554, productId: 0xFA09 }, // 2.4G Wireless Dongle
        ],
      });

      if (!devices || devices.length === 0) {
        this.log('Device selection cancelled by user in browser chooser.');
        return false;
      }

      const selected = devices[0];
      this.validateDeviceChooserSelection(selected);

      // Warning if wireless dongle is chosen
      if (selected.vendorId === 0x3554) {
        this.log('⚠ NOTICE: 2.4GHz wireless receiver connected. Wireless framing requires 20-byte reports.');
      }

      if (!selected.opened) {
        this.log('Opening WebHID interface in read-only mode...');
        await selected.open();
      }

      this.device = selected;
      this.mode = 'webhid-readonly';

      // Register disconnect listener
      this.disconnectHandler = (ev: any) => {
        if (ev.device === this.device) {
          this.log('Hardware device physically disconnected. Returning to simulator.');
          this.switchToSimulator();
        }
      };
      if ('addEventListener' in hidNav) {
        hidNav.addEventListener('disconnect', this.disconnectHandler);
      }

      this.log(`Successfully opened ${this.device.productName || 'AULA F75'} (Hardware Read-Only Diagnostics Active)`);

      this.notify({
        isConnected: true,
        isSimulated: false,
        mode: 'webhid-readonly',
        deviceName: this.device.productName || 'AULA F75',
        vendorId: `0x${this.device.vendorId.toString(16).toUpperCase()}`,
        productId: `0x${this.device.productId.toString(16).toUpperCase()}`,
      });

      await this.readMatrixData();
      return true;
    } catch (err: any) {
      this.log(`Connection error: ${err.message}`);
      return false;
    }
  }

  public validateDeviceChooserSelection(dev: any): void {
    const isWired = dev.vendorId === 0x258A && dev.productId === 0x010C;
    const isWireless = dev.vendorId === 0x3554 && dev.productId === 0xFA09;
    if (!isWired && !isWireless) {
      throw new SafetyViolationError(
        `Selected device (VID 0x${dev.vendorId.toString(16)}, PID 0x${dev.productId.toString(16)}) is not an approved AULA keyboard.`,
        'DEVICE_VALIDATION_FAILED'
      );
    }
  }

  /**
   * Reads 512-byte Table 0 base keymap table.
   * Safe non-mutating query (CMD 0x83).
   */
  public async readBaseTable(): Promise<Uint8Array> {
    if (this.mode === 'simulation') {
      return this.simulator.readBaseTable();
    }

    if (!this.device || !this.device.opened) {
      throw new Error('Device not connected');
    }

    // Gatekeeper enforcement
    SafetyPolicy.assertCommandAllowed(APPROVED_READ_OPCODES.KEYMAP_READ);

    const query = new Uint8Array(519);
    query[0] = APPROVED_READ_OPCODES.KEYMAP_READ; // 0x83
    query[1] = 0; // Layer 0
    query[2] = 0;
    query[3] = 1; // Total packets: 1
    query[4] = 0; // Packet index: 0
    query[5] = 0;
    query[6] = 2; // Length: 512 bytes (0x0200)

    this.log('[WebHID] Dispatching approved read query: CMD 0x83 (Keymap Layer 0)...');
    await this.device.sendFeatureReport(6, query);
    await new Promise(r => setTimeout(r, 25));

    const res = await this.device.receiveFeatureReport(6);
    const data = new Uint8Array(res.buffer, res.byteOffset, res.byteLength);

    if (data.length < 8) {
      throw new Error(`Wired response frame too short: ${data.length} bytes (minimum 8 required)`);
    }

    const base = (data[0] === 6 && data[1] === 0x83) ? 1 : 0;
    const extracted = data.slice(base + 7, base + 519);

    if (extracted.length < 512) {
      throw new Error(`Incomplete keymap payload: received ${extracted.length} bytes, expected 512`);
    }

    return extracted;
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

    // Simulator mode: validate payload invariants and update in RAM
    SafetyPolicy.assertLayerPayloadIntegrity(table0Data);
    this.simulator.loadLayer0(table0Data);
    this.log('[Simulator] Virtual keymap Layer 0 successfully updated in RAM.');
    await this.readMatrixData();
    return true;
  }

  /**
   * Reads full matrix data (512 bytes Layer 0 + 512 bytes Layer 1).
   */
  public async readMatrixData(): Promise<Uint8Array | null> {
    try {
      this.log(`Reading keymap data (${this.mode === 'simulation' ? 'Simulator RAM' : 'Hardware Telemetry'})...`);
      const baseTable = await this.readBaseTable();

      // First read after connect = save as baseline
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
   * Enforces Fn key immutability at matrix index 53 and sentinel at index 127.
   * In hardware mode, fails closed. In simulator mode, updates virtual matrix in RAM.
   */
  public async writeKeyRemap(matrixIdx: number, newUsage: number): Promise<boolean> {
    // Non-negotiable safety guard: Fn key and Sentinel cannot be remapped
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);

    if (this.mode === 'webhid-readonly') {
      this.log(`[SECURITY BLOCK] Hardware remap write for matrix #${matrixIdx} blocked by safety policy.`);
      throw new SafetyViolationError(
        'Hardware keymap writes are disabled to protect keyboard flash memory.',
        'WRITES_DISABLED'
      );
    }

    // Simulator mode
    this.simulator.updateKeyRemap(matrixIdx, newUsage);
    this.log(`[Simulator] Remapped Matrix #${matrixIdx} -> HID 0x${newUsage.toString(16)} (Updated in RAM)`);
    await this.readMatrixData();
    return true;
  }

  /**
   * Raw combo key remap application.
   * Enforces Fn key immutability at matrix index 53 and sentinel at index 127.
   */
  public async writeKeyRemapRaw(matrixIdx: number, rawBytes: [number, number, number, number]): Promise<boolean> {
    // Non-negotiable safety guard
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);

    if (this.mode === 'webhid-readonly') {
      this.log(`[SECURITY BLOCK] Hardware combo remap for matrix #${matrixIdx} blocked by safety policy.`);
      throw new SafetyViolationError(
        'Hardware combo writes are disabled to protect keyboard flash memory.',
        'WRITES_DISABLED'
      );
    }

    // Simulator mode
    this.simulator.updateKeyRemapRaw(matrixIdx, rawBytes);
    this.log(`[Simulator] Remapped combo Matrix #${matrixIdx} -> [${rawBytes.join(', ')}] (Updated in RAM)`);
    await this.readMatrixData();
    return true;
  }

  /**
   * Surgical Fn Recovery: Restores ONLY the physical Fn record at Matrix Index 53.
   * In hardware mode, fails closed. In simulator mode, restores stock [13, 0, 0, 0] in RAM.
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
   * Queries hardware device model string (CMD 0x82).
   * Safe non-mutating query. Safely handles Linux kernel 14-byte short read.
   */
  public async queryModel(): Promise<string> {
    if (this.mode === 'simulation') {
      return this.simulator.queryModel();
    }

    if (!this.device || !this.device.opened) {
      throw new Error('Device not connected');
    }

    SafetyPolicy.assertCommandAllowed(APPROVED_READ_OPCODES.DEVICE_QUERY);

    const query = new Uint8Array(519);
    query[0] = APPROVED_READ_OPCODES.DEVICE_QUERY; // 0x82
    query[1] = 0;
    query[2] = 0;
    query[3] = 1;

    this.log('[WebHID] Querying device model string (CMD 0x82)...');
    await this.device.sendFeatureReport(6, query);
    await new Promise(r => setTimeout(r, 20));

    const res = await this.device.receiveFeatureReport(6);
    const data = new Uint8Array(res.buffer, res.byteOffset, res.byteLength);

    // Extract ASCII string: accommodates both short 14-byte and full 520-byte buffers
    let startOffset = 0;
    if (data[0] === 6 && data[1] === 0x82) startOffset = 8;
    else if (data[0] === 0x82) startOffset = 7;

    let modelStr = '';
    for (let i = startOffset; i < data.length; i++) {
      const b = data[i];
      if (b === 0) break;
      if (b >= 32 && b <= 126) modelStr += String.fromCharCode(b);
    }
    const clean = modelStr.trim();
    this.log(`[WebHID] Model query returned: "${clean || 'AULA F75'}"`);
    return clean || 'AULA F75';
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
