import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileService } from '../services/profileService.ts';
import { SimulatorTransport } from '../services/simulatorTransport.ts';
import { PHYSICAL_FN_MATRIX_INDEX, LAYER_SENTINEL_INDEX } from '../safety/SafetyPolicy.ts';

function getBase1024(): number[] {
  return Array.from(new SimulatorTransport().getFullMatrix1024());
}

test('ProfileService: initializes with default presets', () => {
  const service = new ProfileService();
  const profiles = service.listProfiles();

  assert(profiles.length >= 3);
  const defaultAnsi = service.getActiveProfile();
  assert.strictEqual(defaultAnsi.id, 'profile-default-ansi');
  assert.strictEqual(defaultAnsi.name, 'Factory Default ANSI');
  assert.strictEqual(defaultAnsi.isPreset, true);
  assert.strictEqual(defaultAnsi.matrix1024.length, 1024);
  assert.strictEqual(defaultAnsi.schemaVersion, 1);
});

test('ProfileService: create, duplicate, rename, export, and delete workflow', () => {
  const service = new ProfileService();
  const initialCount = service.listProfiles().length;

  // 1. Create Profile
  const created = service.createProfile('My Custom Layout', 'Testing custom workflow');
  assert.strictEqual(created.name, 'My Custom Layout');
  assert.strictEqual(created.description, 'Testing custom workflow');
  assert.strictEqual(created.isPreset, false);
  assert.strictEqual(service.listProfiles().length, initialCount + 1);
  assert.strictEqual(service.getActiveProfile().id, created.id);

  // 2. Rename Profile
  const renameOk = service.renameProfile(created.id, 'Renamed Custom Layout');
  assert.strictEqual(renameOk.success, true);
  assert.strictEqual(service.getProfileById(created.id)?.name, 'Renamed Custom Layout');

  // Prevent renaming built-in presets
  const renamePreset = service.renameProfile('profile-default-ansi', 'Hacked Default');
  assert.strictEqual(renamePreset.success, false);
  assert.strictEqual(service.getProfileById('profile-default-ansi')?.name, 'Factory Default ANSI');

  // 3. Duplicate Profile
  const duplicated = service.duplicateProfile(created.id);
  assert.strictEqual(duplicated.name, 'Renamed Custom Layout (Copy)');
  assert.notStrictEqual(duplicated.id, created.id);
  assert.strictEqual(duplicated.matrix1024.length, 1024);
  assert.strictEqual(service.listProfiles().length, initialCount + 2);

  // 4. Export Profile
  const exportedJson = service.exportProfile(created.id);
  assert.doesNotThrow(() => JSON.parse(exportedJson));
  const parsed = JSON.parse(exportedJson);
  assert.strictEqual(parsed.schemaVersion, 1);
  assert.strictEqual(parsed.name, 'Renamed Custom Layout');
  assert.strictEqual(parsed.matrix1024.length, 1024);

  // 5. Delete Profile
  const deleteOk = service.deleteProfile(created.id);
  assert.strictEqual(deleteOk.success, true);
  assert.strictEqual(service.getProfileById(created.id), undefined);

  // Prevent deleting built-in presets
  const deletePreset = service.deleteProfile('profile-default-ansi');
  assert.strictEqual(deletePreset.success, false);
});

test('ProfileService: atomic profile import with unchanged state on failure', () => {
  const service = new ProfileService();
  const beforeCount = service.listProfiles().length;
  const beforeActiveId = service.getActiveProfile().id;

  // Case 1: Malformed JSON
  const malformedRes = service.importProfile('{ invalid json }');
  assert.strictEqual(malformedRes.success, false);
  assert(malformedRes.error?.includes('Malformed JSON'));
  assert.strictEqual(service.listProfiles().length, beforeCount);
  assert.strictEqual(service.getActiveProfile().id, beforeActiveId);

  // Case 2: Truncated matrix length
  const truncatedPayload = JSON.stringify({
    schemaVersion: 1,
    name: 'Short Matrix Profile',
    matrix1024: [0, 0, 0, 41, 0, 0, 0, 53], // only 8 bytes
  });
  const truncatedRes = service.importProfile(truncatedPayload);
  assert.strictEqual(truncatedRes.success, false);
  assert(truncatedRes.error?.includes('Invalid matrix size'));
  assert.strictEqual(service.listProfiles().length, beforeCount);
  assert.strictEqual(service.getActiveProfile().id, beforeActiveId);

  // Case 3: Corrupted Escape key (slot 0 not 0x29)
  const corruptEscMatrix = getBase1024();
  corruptEscMatrix[3] = 0x04; // 'A' instead of Escape
  const corruptEscPayload = JSON.stringify({
    schemaVersion: 1,
    name: 'Corrupt Esc Profile',
    matrix1024: corruptEscMatrix,
  });
  const corruptEscRes = service.importProfile(corruptEscPayload);
  assert.strictEqual(corruptEscRes.success, false);
  assert(corruptEscRes.error?.includes('Escape key check failed'));
  assert.strictEqual(service.listProfiles().length, beforeCount);
  assert.strictEqual(service.getActiveProfile().id, beforeActiveId);

  // Case 4: Corrupted Physical Fn key (slot 53 not 0x0D)
  const corruptFnMatrix = getBase1024();
  corruptFnMatrix[PHYSICAL_FN_MATRIX_INDEX * 4] = 0x00; // invalid Fn type
  const corruptFnPayload = JSON.stringify({
    schemaVersion: 1,
    name: 'Corrupt Fn Profile',
    matrix1024: corruptFnMatrix,
  });
  const corruptFnRes = service.importProfile(corruptFnPayload);
  assert.strictEqual(corruptFnRes.success, false);
  assert(corruptFnRes.error?.includes('Physical Fn key invariant violated'));
  assert.strictEqual(service.listProfiles().length, beforeCount);
  assert.strictEqual(service.getActiveProfile().id, beforeActiveId);

  // Case 5: Corrupted Slot 127 (abnormal non-padding / non-sentinel bytes)
  const corrupt127Matrix = getBase1024();
  corrupt127Matrix[LAYER_SENTINEL_INDEX * 4 + 2] = 0xDE;
  corrupt127Matrix[LAYER_SENTINEL_INDEX * 4 + 3] = 0xAD;
  const corrupt127Payload = JSON.stringify({
    schemaVersion: 1,
    name: 'Corrupt 127 Profile',
    matrix1024: corrupt127Matrix,
  });
  const corrupt127Res = service.importProfile(corrupt127Payload);
  assert.strictEqual(corrupt127Res.success, false);
  assert(corrupt127Res.error?.includes('Slot 127 check failed'));
  assert.strictEqual(service.listProfiles().length, beforeCount);
  assert.strictEqual(service.getActiveProfile().id, beforeActiveId);
});

test('ProfileService: accepts valid profiles with both 0-padding and disputed sentinel at slot 127', () => {
  const service = new ProfileService();

  // Valid with [0x5A, 0xA5]
  const validSentinelMatrix = getBase1024();
  validSentinelMatrix[LAYER_SENTINEL_INDEX * 4 + 2] = 0x5A;
  validSentinelMatrix[LAYER_SENTINEL_INDEX * 4 + 3] = 0xA5;

  const res1 = service.importProfile(
    JSON.stringify({
      schemaVersion: 1,
      name: 'Valid Sentinel Profile',
      matrix1024: validSentinelMatrix,
    })
  );
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.profile?.name, 'Valid Sentinel Profile');

  // Valid with standard [0x00, 0x00] padding
  const validZeroMatrix = getBase1024();
  validZeroMatrix[LAYER_SENTINEL_INDEX * 4 + 2] = 0x00;
  validZeroMatrix[LAYER_SENTINEL_INDEX * 4 + 3] = 0x00;

  const res2 = service.importProfile(
    JSON.stringify({
      schemaVersion: 1,
      name: 'Valid Zero Padding Profile',
      matrix1024: validZeroMatrix,
    })
  );
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.profile?.name, 'Valid Zero Padding Profile');
});

test('ProfileService: handles browser storage corruption and exceptions gracefully', () => {
  // Simulate mock corrupt localStorage
  const originalWindow = globalThis.window;
  try {
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => {
          if (key === 'aula_f75_simulator_profiles_v1') return '{ CORRUPT MALFORMED JSON !!! ';
          return null;
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    };

    // Constructing service with corrupt storage must not throw
    let service: ProfileService | null = null;
    assert.doesNotThrow(() => {
      service = new ProfileService();
    });

    assert(service !== null);
    const profiles = (service as unknown as ProfileService).listProfiles();
    assert(profiles.length >= 3);
    assert.strictEqual((service as unknown as ProfileService).getActiveProfile().id, 'profile-default-ansi');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('ProfileService: detects unsaved changes against active profile', () => {
  const service = new ProfileService();
  const active = service.getActiveProfile();
  const currentMatrix = new Uint8Array(active.matrix1024);

  // Unmodified
  assert.strictEqual(service.hasUnsavedChanges(currentMatrix), false);

  // Modify slot 9 ('A' -> 'B')
  currentMatrix[9 * 4 + 3] = 0x05;
  assert.strictEqual(service.hasUnsavedChanges(currentMatrix), true);

  // Save changes
  service.saveActiveProfileMatrix(currentMatrix);
  assert.strictEqual(service.hasUnsavedChanges(currentMatrix), false);
});
