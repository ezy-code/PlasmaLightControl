// QML entry point: names must match the PresetSync.* calls in PresetSync.qml.
export { createPresetSync } from "../presets/sync.ts";

export type {
    PresetSyncModule,
    SyncCache,
    SyncConfig,
    SyncError,
    SyncEvents,
    SyncHost,
    SyncTimer,
    SyncTransport,
} from "../presets/sync.ts";
