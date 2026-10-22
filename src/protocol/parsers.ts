// ============================================================================
// Protocol Parsers for Wired AULA F75 Responses
// Clean-Room Handling of Linux Kernel Quirks & Response Boundaries
// ============================================================================

import { WIRED_REPORT_ID, SafetyPolicy } from '../safety/SafetyPolicy.ts';

/**
 * Parses the response from CMD 0x82 (Device Identity Query).
 * Accommodates full 520-byte buffers, 519-byte buffers, and Linux HIDIOCGFEATURE
 * short buffers (e.g. 14 bytes ASCII payload).
 */
export function parseDeviceIdentityResponse(data: Uint8Array): string {
  if (data.length === 0) {
    return '';
  }

  // Determine payload start offset
  let startOffset = 0;
  if (data.length >= 520 && data[0] === WIRED_REPORT_ID && data[1] === 0x82) {
    // Full 520-byte wire frame: [ReportId=6, Opcode=0x82, ... header 8 bytes ..., Payload at offset 8]
    startOffset = 8;
  } else if (data.length >= 519 && data[0] === 0x82) {
    // Full 519-byte payload: [Opcode=0x82, ... header 7 bytes ..., Payload at offset 7]
    startOffset = 7;
  } else if (data[0] === WIRED_REPORT_ID && data[1] === 0x82) {
    // Short buffer with Report ID header [6, 0x82, ASCII...]
    startOffset = 2;
  } else if (data[0] === 0x82) {
    // Short buffer with Opcode [0x82, ASCII...]
    startOffset = 1;
  } else {
    // Raw ASCII data without header
    startOffset = 0;
  }

  let model = '';
  for (let i = startOffset; i < data.length; i++) {
    const byte = data[i];
    if (byte === 0) break; // Null terminator
    if (byte >= 32 && byte <= 126) {
      model += String.fromCharCode(byte);
    }
  }

  return model.trim();
}

/**
 * Parses the response from CMD 0x83 (Keymap Layer 0 Readback).
 * Extracts exactly 512 bytes of Table 0 and validates layer integrity.
 */
export function parseWiredKeymapResponse(data: Uint8Array): Uint8Array {
  if (data.length < 8) {
    throw new Error(`Response frame too short: received ${data.length} bytes (minimum 8 required)`);
  }

  let base = 0;
  if (data[0] === WIRED_REPORT_ID && data[1] === 0x83) {
    base = 1;
  } else if (data[0] === 0x83) {
    base = 0;
  } else {
    throw new Error(
      `Response does not match expected CMD 0x83: byte[0]=0x${data[0].toString(16)}, byte[1]=0x${data[1]?.toString(16)}`
    );
  }

  const payloadStart = base + 7;
  const payloadEnd = payloadStart + 512;

  if (data.length < payloadEnd) {
    throw new Error(
      `Incomplete keymap payload: received ${data.length} bytes, expected at least ${payloadEnd}`
    );
  }

  const keymap = data.slice(payloadStart, payloadEnd);
  SafetyPolicy.assertLayerPayloadIntegrity(keymap);
  return keymap;
}
