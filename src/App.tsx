import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { KeyboardGrid } from './components/KeyboardGrid';
import { KeyRemapPanel } from './components/KeyRemapPanel';
import { BackupPanel } from './components/BackupPanel';
import { LogViewer } from './components/LogViewer';
import { Overview } from './components/Overview';
import { LiveInputWidget } from './components/LiveInputWidget';
import { FnWinRepairWidget } from './components/FnWinRepairWidget';
import { RgbControlPanel } from './components/RgbControlPanel';
import { Profiles } from './components/Profiles';
import { webhid, PRISTINE_STAGE5_MATRIX, type WebHIDState } from './services/webhid';
import { parseKeyRecordUsage, type KeyRecord } from './types/hid';
import { rgbService } from './services/rgbService';
import { profileService } from './services/profileService';
import type { SimulatorProfile } from './types/profile';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedMatrixIdx, setSelectedMatrixIdx] = useState<number | null>(9); // Default select 'A' (matrix 9)
  const [activeProfile, setActiveProfile] = useState<SimulatorProfile>(profileService.getActiveProfile());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  
  // State from webhid service (defaulted to safe In-Memory Simulator)
  const [hidState, setHidState] = useState<WebHIDState>({
    isConnected: true,
    isSimulated: true,
    mode: 'simulation',
    deviceName: 'AULA F75 (Simulator)',
    vendorId: '0x258A',
    productId: '0x010C',
    matrixData: new Uint8Array([...PRISTINE_STAGE5_MATRIX[0], ...PRISTINE_STAGE5_MATRIX[1]]),
    records: new Map<number, KeyRecord>(),
    modifiedCount: 0,
    logs: ['[Init] AULA Control Center Web ready.', '[Safety] Running in 100% In-Memory Simulator mode.'],
  });

  // Initialize records from pristine matrix initially
  useEffect(() => {
    const initialRecords = new Map<number, KeyRecord>();
    for (let idx = 0; idx < 128; idx++) {
      const offset = idx * 4;
      const bytes: [number, number, number, number] = [
        PRISTINE_STAGE5_MATRIX[0][offset],
        PRISTINE_STAGE5_MATRIX[0][offset + 1],
        PRISTINE_STAGE5_MATRIX[0][offset + 2],
        PRISTINE_STAGE5_MATRIX[0][offset + 3],
      ];
      const parsedUsage = parseKeyRecordUsage(bytes);
      initialRecords.set(idx, {
        matrixIdx: idx,
        hidUsage: parsedUsage,
        originalUsage: parsedUsage,
        bytes,
      });
    }

    setHidState((prev) => ({
      ...prev,
      records: initialRecords,
      modifiedCount: 0,
    }));
  }, []);

  // Subscribe to profile changes
  useEffect(() => {
    const unsubscribe = profileService.subscribe((_profiles, activeId) => {
      const current = profileService.getProfileById(activeId) || profileService.getActiveProfile();
      setActiveProfile(current);
    });
    return unsubscribe;
  }, []);

  // Check unsaved changes whenever matrixData changes
  useEffect(() => {
    if (hidState.matrixData) {
      setHasUnsavedChanges(profileService.hasUnsavedChanges(hidState.matrixData));
    }
  }, [hidState.matrixData, activeProfile]);

  // Subscribe to webhid controller updates
  useEffect(() => {
    const unsubscribe = webhid.subscribe((update) => {
      setHidState((prev) => ({
        ...prev,
        ...update,
      }));
    });
    return unsubscribe;
  }, []);

  const handleApplyProfileToSimulator = (profile: SimulatorProfile) => {
    try {
      const full = new Uint8Array(profile.matrix1024);
      webhid.activeSimulator.loadLayer0(full.subarray(0, 512));

      // Reconstruct records map
      const newRecords = new Map<number, KeyRecord>();
      for (let idx = 0; idx < 128; idx++) {
        const offset = idx * 4;
        const bytes: [number, number, number, number] = [
          full[offset],
          full[offset + 1],
          full[offset + 2],
          full[offset + 3],
        ];
        const parsedUsage = parseKeyRecordUsage(bytes);
        const stockOffset = idx * 4;
        const stockBytes: [number, number, number, number] = [
          PRISTINE_STAGE5_MATRIX[0][stockOffset],
          PRISTINE_STAGE5_MATRIX[0][stockOffset + 1],
          PRISTINE_STAGE5_MATRIX[0][stockOffset + 2],
          PRISTINE_STAGE5_MATRIX[0][stockOffset + 3],
        ];
        const origUsage = parseKeyRecordUsage(stockBytes);

        newRecords.set(idx, {
          matrixIdx: idx,
          hidUsage: parsedUsage,
          originalUsage: origUsage,
          bytes,
        });
      }

      let modCount = 0;
      newRecords.forEach((rec) => {
        if (rec.hidUsage !== rec.originalUsage) modCount++;
      });

      setHidState((prev) => ({
        ...prev,
        matrixData: full,
        records: newRecords,
        modifiedCount: modCount,
      }));

      // Apply RGB if defined in profile
      if (profile.rgb) {
        rgbService.setHardwareEffect(
          profile.rgb.effectId,
          profile.rgb.brightness,
          profile.rgb.speed,
          profile.rgb.colorful,
          profile.rgb.color
        );
      }

      webhid.log(`[Profile] Activated profile "${profile.name}" in Simulator RAM.`);
    } catch (err: any) {
      webhid.log(`[Profile Error] Could not load profile: ${err.message}`);
    }
  };

  const handleApplyRemap = async (matrixIdx: number, newUsage: number) => {
    const success = await webhid.writeKeyRemap(matrixIdx, newUsage);
    if (success) {
      setHidState((prev) => {
        const newRecords = new Map(prev.records);
        const existing = newRecords.get(matrixIdx);
        if (existing) {
          newRecords.set(matrixIdx, {
            ...existing,
            hidUsage: newUsage,
          });
        }
        let modCount = 0;
        newRecords.forEach((rec) => {
          if (rec.hidUsage !== rec.originalUsage) modCount++;
        });

        const newMatrix = prev.matrixData ? new Uint8Array(prev.matrixData) : new Uint8Array(1024);
        newMatrix[matrixIdx * 4 + 3] = newUsage;

        return {
          ...prev,
          matrixData: newMatrix,
          records: newRecords,
          modifiedCount: modCount,
        };
      });
    }
  };

  const handleApplyComboRemap = async (matrixIdx: number, rawBytes: [number, number, number, number]) => {
    const success = await webhid.writeKeyRemapRaw(matrixIdx, rawBytes);
    if (success) {
      setHidState((prev) => {
        const newRecords = new Map(prev.records);
        const existing = newRecords.get(matrixIdx);
        if (existing) {
          newRecords.set(matrixIdx, {
            ...existing,
            bytes: rawBytes,
            hidUsage: rawBytes[3] || rawBytes[1],
          });
        }
        let modCount = 0;
        newRecords.forEach((rec) => {
          if (rec.hidUsage !== rec.originalUsage) modCount++;
        });

        const newMatrix = prev.matrixData ? new Uint8Array(prev.matrixData) : new Uint8Array(1024);
        newMatrix.set(rawBytes, matrixIdx * 4);

        return {
          ...prev,
          matrixData: newMatrix,
          records: newRecords,
          modifiedCount: modCount,
        };
      });
    }
  };

  const handleSwapWinAlt = async () => {
    const currentWin = hidState.records.get(11)?.hidUsage || 0xE3;
    const currentAlt = hidState.records.get(17)?.hidUsage || 0xE2;

    await handleApplyRemap(11, currentAlt);
    await handleApplyRemap(17, currentWin);
    webhid.log('[Simulator] Swapped Windows (Matrix 11) and Left Alt (Matrix 17) in RAM');
  };

  const handleResetKey = async (matrixIdx: number) => {
    const rec = hidState.records.get(matrixIdx);
    if (rec) {
      await handleApplyRemap(matrixIdx, rec.originalUsage);
    }
  };

  const handleResetAll = async () => {
    if (confirm('Reset all keys to factory stock mapping in Simulator RAM?')) {
      for (const [idx, rec] of hidState.records.entries()) {
        if (rec.hidUsage !== rec.originalUsage) {
          await handleApplyRemap(idx, rec.originalUsage);
        }
      }
    }
  };

  const handleRefreshMatrix = () => {
    const active = profileService.getActiveProfile();
    handleApplyProfileToSimulator(active);
  };

  const keyboardGridComponent = (
    <KeyboardGrid
      selectedMatrixIdx={selectedMatrixIdx}
      onSelectKey={(idx) => setSelectedMatrixIdx(idx)}
      records={hidState.records}
    />
  );

  return (
    <div className="flex bg-[#0a0a0a] min-h-screen text-slate-100 antialiased selection:bg-white selection:text-black">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={hidState.isConnected}
        deviceName={hidState.deviceName}
        mode={hidState.mode}
      />

      {/* Main Right Content Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          isConnected={hidState.isConnected}
          modifiedCount={hidState.modifiedCount}
          mode={hidState.mode}
          activeProfileName={activeProfile.name}
          hasUnsavedChanges={hasUnsavedChanges}
        />

        <main className="flex-1 px-10 pb-10 space-y-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Overview
                isConnected={hidState.isConnected}
                modifiedCount={hidState.modifiedCount}
                mode={hidState.mode}
                activeProfileName={activeProfile.name}
                keyboardElement={keyboardGridComponent}
                onNavigateToProfiles={() => setActiveTab('profiles')}
              />

              <LiveInputWidget records={hidState.records} />

              <KeyRemapPanel
                selectedMatrixIdx={selectedMatrixIdx}
                records={hidState.records}
                onApplyRemap={handleApplyRemap}
                onApplyComboRemap={handleApplyComboRemap}
                onSwapWinAlt={handleSwapWinAlt}
                onResetKey={handleResetKey}
                onResetAll={handleResetAll}
              />
            </div>
          )}

          {activeTab === 'profiles' && (
            <Profiles
              currentMatrix={hidState.matrixData || new Uint8Array(1024)}
              onApplyProfileToSimulator={handleApplyProfileToSimulator}
              onRefreshMatrix={handleRefreshMatrix}
            />
          )}

          {activeTab === 'rgb' && (
            <RgbControlPanel isConnected={hidState.isConnected} />
          )}

          {activeTab === 'backup' && (
            <div className="space-y-6">
              <FnWinRepairWidget onRefresh={() => webhid.readMatrixData()} />
              <BackupPanel
                matrixData={hidState.matrixData}
                onRefresh={() => webhid.readMatrixData()}
              />
            </div>
          )}

          {activeTab === 'logs' && (
            <LogViewer logs={hidState.logs} onClear={() => setHidState((p) => ({ ...p, logs: [] }))} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
