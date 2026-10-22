import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWiredQueryPayload } from '../protocol/framing.ts';
import {
  parseDeviceIdentityResponse,
  parseWiredKeymapResponse,
} from '../protocol/parsers.ts';
import { PRISTINE_STAGE5_MATRIX } from '../services/pristineMatrix.ts';

test('Protocol Framing: buildWiredQueryPayload prepares exact 519-byte outbound payload for CMD 0x82', () => {
  const payload = buildWiredQueryPayload(0x82, 0, 0);
  assert.strictEqual(payload.length, 519);
  assert.strictEqual(payload[0], 0x82); // Opcode
  assert.strictEqual(payload[1], 0x00); // Layer 0
  assert.strictEqual(payload[2], 0x00); // Reserved
  assert.strictEqual(payload[3], 0x01); // 1 packet
  assert.strictEqual(payload[4], 0x00); // Packet index
  assert.strictEqual(payload[5], 0x00); // Len lo
  assert.strictEqual(payload[6], 0x00); // Len hi

  // Rest should be zeros
  for (let i = 7; i < 519; i++) {
    assert.strictEqual(payload[i], 0);
  }
});

test('Protocol Framing: buildWiredQueryPayload prepares exact 519-byte outbound payload for CMD 0x83', () => {
  const payload = buildWiredQueryPayload(0x83, 0, 512);
  assert.strictEqual(payload.length, 519);
  assert.strictEqual(payload[0], 0x83); // Opcode
  assert.strictEqual(payload[1], 0x00); // Layer 0
  assert.strictEqual(payload[2], 0x00); // Reserved
  assert.strictEqual(payload[3], 0x01); // 1 packet
  assert.strictEqual(payload[4], 0x00); // Packet index
  assert.strictEqual(payload[5], 0x00); // Len lo (512 = 0x0200)
  assert.strictEqual(payload[6], 0x02); // Len hi
});

test('Protocol Framing: buildWiredQueryPayload blocks mutating or deferred opcodes', () => {
  // Mutating
  assert.throws(() => buildWiredQueryPayload(0x03), (err: any) => err.code === 'MUTATING_COMMAND_BLOCKED');
  // Deferred
  assert.throws(() => buildWiredQueryPayload(0x84), (err: any) => err.code === 'DEFERRED_COMMAND_BLOCKED');
  assert.throws(() => buildWiredQueryPayload(0x8A), (err: any) => err.code === 'DEFERRED_COMMAND_BLOCKED');
  // Unknown
  assert.throws(() => buildWiredQueryPayload(0x99), (err: any) => err.code === 'UNKNOWN_COMMAND_REJECTED');
});

test('Protocol Parsers: parseDeviceIdentityResponse decodes full 520-byte response with Report ID', () => {
  const frame = new Uint8Array(520);
  frame[0] = 6;
  frame[1] = 0x82;
  const nameBytes = new TextEncoder().encode('AULA-F75-V1.0');
  frame.set(nameBytes, 8);

  const model = parseDeviceIdentityResponse(frame);
  assert.strictEqual(model, 'AULA-F75-V1.0');
});

test('Protocol Parsers: parseDeviceIdentityResponse decodes full 519-byte response without Report ID', () => {
  const frame = new Uint8Array(519);
  frame[0] = 0x82;
  const nameBytes = new TextEncoder().encode('AULA-F75-TEST');
  frame.set(nameBytes, 7);

  const model = parseDeviceIdentityResponse(frame);
  assert.strictEqual(model, 'AULA-F75-TEST');
});

test('Protocol Parsers: parseDeviceIdentityResponse handles Linux HIDIOCGFEATURE 14-byte short read', () => {
  // Linux kernel quirk: 14 bytes starting with opcode
  const shortWithOp = new Uint8Array(14);
  shortWithOp[0] = 0x82;
  const name = new TextEncoder().encode('AULA-F75-LNX');
  shortWithOp.set(name, 1);

  const parsed = parseDeviceIdentityResponse(shortWithOp);
  assert.strictEqual(parsed, 'AULA-F75-LNX');

  // Linux kernel quirk: 14 bytes raw ASCII directly
  const rawShort = new TextEncoder().encode('AULA-F75-RAW\0\0');
  const parsedRaw = parseDeviceIdentityResponse(rawShort);
  assert.strictEqual(parsedRaw, 'AULA-F75-RAW');
});

test('Protocol Parsers: parseWiredKeymapResponse extracts and validates 512-byte Table 0 payload', () => {
  const validKeymap = new Uint8Array(PRISTINE_STAGE5_MATRIX[0]);
  // Pad to 512 bytes with sentinel
  const table0 = new Uint8Array(512);
  table0.set(validKeymap, 0);
  table0[127 * 4 + 2] = 0x5A;
  table0[127 * 4 + 3] = 0xA5;

  // Frame with Report ID 6
  const frame = new Uint8Array(520);
  frame[0] = 6;
  frame[1] = 0x83;
  frame[6] = 0x00;
  frame[7] = 0x02;
  frame.set(table0, 8);

  const extracted = parseWiredKeymapResponse(frame);
  assert.strictEqual(extracted.length, 512);
  assert.strictEqual(extracted[3], 0x29); // Esc
  assert.strictEqual(extracted[53 * 4], 0x0D); // Fn
  assert.strictEqual(extracted[127 * 4 + 2], 0x5A);
  assert.strictEqual(extracted[127 * 4 + 3], 0xA5);
});

test('Protocol Parsers: parseWiredKeymapResponse rejects truncated or malformed responses', () => {
  // Too short
  assert.throws(
    () => parseWiredKeymapResponse(new Uint8Array(7)),
    /Response frame too short/
  );

  // Mismatched command
  const badOp = new Uint8Array(520);
  badOp[0] = 6;
  badOp[1] = 0x84; // not 0x83
  assert.throws(
    () => parseWiredKeymapResponse(badOp),
    /Response does not match expected CMD 0x83/
  );

  // Incomplete payload
  const incomplete = new Uint8Array(300);
  incomplete[0] = 6;
  incomplete[1] = 0x83;
  assert.throws(
    () => parseWiredKeymapResponse(incomplete),
    /Incomplete keymap payload/
  );
});
