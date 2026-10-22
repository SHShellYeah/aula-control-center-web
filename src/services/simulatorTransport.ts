// ============================================================================
// 100% In-Memory Keyboard Hardware Simulator
// GUARANTEE: Never touches navigator.hid, WebHID, or native hardware.
// ============================================================================

import { PRISTINE_STAGE5_MATRIX } from './pristineMatrix.ts';
import {
  SafetyPolicy,
  PHYSICAL_FN_MATRIX_INDEX,
  LAYER_SENTINEL_INDEX,
} from '../safety/SafetyPolicy.ts';
import { encodeKeyRecordBytes } from '../types/hid.ts';

export class SimulatorTransport {
  public readonly isSimulated = true;
  private _virtualLayer0: Uint8Array = new Uint8Array(512);
  private _virtualLayer1: Uint8Array = new Uint8Array(512);
  private _virtualConfig: Uint8Array = new Uint8Array(128);

  constructor() {
    this.resetToDefaults();
  }

  public resetToDefaults(): void {
    this._virtualLayer0.set(PRISTINE_STAGE5_MATRIX[0]);
    this._virtualLayer1.set(PRISTINE_STAGE5_MATRIX[1]);

    // Ensure invariants in memory
    this._virtualLayer0[0] = 0x00;
    this._virtualLayer0[3] = 0x29; // Esc

    const fnOff = PHYSICAL_FN_MATRIX_INDEX * 4;
    this._virtualLayer0[fnOff] = 0x0D; // KeyType: Fn (13)
    this._virtualLayer0[fnOff + 1] = 0x00;
    this._virtualLayer0[fnOff + 2] = 0x00;
    this._virtualLayer0[fnOff + 3] = 0x00;

    const sentOff = LAYER_SENTINEL_INDEX * 4;
    this._virtualLayer0[sentOff] = 0x00;
    this._virtualLayer0[sentOff + 1] = 0x00;
    this._virtualLayer0[sentOff + 2] = 0x5A;
    this._virtualLayer0[sentOff + 3] = 0xA5;

    // Config block defaults
    this._virtualConfig.fill(0);
    this._virtualConfig[9] = 0;   // Preset effect mode
    this._virtualConfig[10] = 3;  // Effect: Rainbow
    this._virtualConfig[0x3A] = 5; // Brightness
    this._virtualConfig[0x3B] = (2 << 4) | 7; // Speed=2, Rainbow color=7
    this._virtualConfig[126] = 0x5A;
    this._virtualConfig[127] = 0xA5;
  }

  public getFullMatrix1024(): Uint8Array {
    const full = new Uint8Array(1024);
    full.set(this._virtualLayer0, 0);
    full.set(this._virtualLayer1, 512);
    return full;
  }

  public readBaseTable(): Uint8Array {
    return new Uint8Array(this._virtualLayer0);
  }

  public readConfig(): Uint8Array {
    return new Uint8Array(this._virtualConfig);
  }

  public queryModel(): string {
    return 'AULA-F75-SIM1.0';
  }

  /**
   * Updates virtual keymap in RAM with full invariant enforcement.
   */
  public updateKeyRemap(matrixIdx: number, newUsage: number): boolean {
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);
    const newBytes = encodeKeyRecordBytes(newUsage);
    const offset = matrixIdx * 4;
    this._virtualLayer0[offset] = newBytes[0];
    this._virtualLayer0[offset + 1] = newBytes[1];
    this._virtualLayer0[offset + 2] = newBytes[2];
    this._virtualLayer0[offset + 3] = newBytes[3];
    return true;
  }

  /**
   * Updates virtual keymap in RAM with raw combo record.
   */
  public updateKeyRemapRaw(matrixIdx: number, rawBytes: [number, number, number, number]): boolean {
    SafetyPolicy.assertKeyRemapAllowed(matrixIdx);
    const offset = matrixIdx * 4;
    this._virtualLayer0[offset] = rawBytes[0];
    this._virtualLayer0[offset + 1] = rawBytes[1];
    this._virtualLayer0[offset + 2] = rawBytes[2];
    this._virtualLayer0[offset + 3] = rawBytes[3];
    return true;
  }

  /**
   * Bulk loads a validated 512-byte layer into virtual RAM.
   */
  public loadLayer0(layerData: Uint8Array): void {
    SafetyPolicy.assertLayerPayloadIntegrity(layerData);
    this._virtualLayer0.set(layerData.subarray(0, 512));
  }

  /**
   * Updates virtual LED config in RAM.
   */
  public updateConfig(effectId: number, speed: number, brightness: number, colorIndex: number): void {
    this._virtualConfig[9] = 0;
    this._virtualConfig[10] = effectId & 0xff;
    this._virtualConfig[0x3A] = Math.round((brightness / 5) * 9);
    this._virtualConfig[0x3B] = (((speed - 1) & 0x0f) << 4) | (colorIndex & 0x0f);
  }
}
