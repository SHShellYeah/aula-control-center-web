// ============================================================================
// Protocol Framing for Wired AULA F75 (Report ID 0x06)
// Zero Side-Effects, Pure Mathematical Data Transformations
// ============================================================================

import {
  WIRED_FRAME_PAYLOAD_LEN,
  SafetyPolicy,
} from '../safety/SafetyPolicy.ts';

/**
 * Builds the 519-byte outbound feature report payload for Wired AULA F75 (Report ID 0x06).
 *
 * Payload Structure (excluding Report ID byte handled by WebHID sendFeatureReport):
 * [0]      Command Opcode (e.g. 0x82 or 0x83)
 * [1]      Layer / Subcommand ID (e.g. 0 for Layer 0)
 * [2]      Reserved (0x00)
 * [3]      Total Packets (0x01)
 * [4]      Packet Index (0x00)
 * [5]      Payload Length Low Byte (e.g. 0x00 for 512, 0x00 for query)
 * [6]      Payload Length High Byte (e.g. 0x02 for 512, 0x00 for query)
 * [7..518] Query data / zeros (512 bytes)
 */
export function buildWiredQueryPayload(
  command: number,
  layer: number = 0,
  expectedLen: number = 0
): Uint8Array {
  // Enforce command permission immediately before constructing payload
  SafetyPolicy.assertCommandAllowed(command);

  const payload = new Uint8Array(WIRED_FRAME_PAYLOAD_LEN);
  payload[0] = command & 0xff;
  payload[1] = layer & 0xff;
  payload[2] = 0x00;
  payload[3] = 0x01; // 1 packet
  payload[4] = 0x00; // Packet index 0
  payload[5] = expectedLen & 0xff;
  payload[6] = (expectedLen >> 8) & 0xff;

  SafetyPolicy.assertOutboundQueryPayload(command, payload);
  return payload;
}
