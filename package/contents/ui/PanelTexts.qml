// qmllint disable missing-property
import QtQuick

// User-facing strings; kept in QML because xgettext only scans .qml files.
QtObject {
    function text(key, argument) {
        switch (key) {
        case "title":
            return i18n("Plasma Light Control");
        case "notConfigured":
            return i18n("Not configured");
        case "syncConnecting":
            return i18n("Connecting to Home Assistant…");
        case "syncWaiting":
            return i18n("Waiting for Home Assistant…");
        case "syncAuthenticating":
            return i18n("Authenticating with Home Assistant…");
        case "syncSyncing":
            return i18n("Syncing color presets…");
        case "syncSynced":
            return i18n("Synced with Home Assistant");
        case "syncReadonly":
            return i18n("Read-only: administrator token required");
        case "syncUnsupported":
            return i18n("Color presets are not supported for this entity.");
        case "syncFailed":
            return i18n("Could not sync color presets.");
        case "syncSaveUnsupported":
            return i18n("The current color cannot be saved in Home Assistant.");
        case "syncAlreadySaved":
            return i18n("This color is already in the presets.");
        case "syncSaving":
            return i18n("Saving color presets to Home Assistant…");
        case "syncRestoreFailed":
            return i18n("Could not restore the color presets; the current list was kept.");
        case "tooltipHint":
            return i18n("Left-click: popup · Middle-click: toggle · Wheel: brightness");
        case "tooltipNotConfigured":
            return i18n("Not configured – please set up the connection.");
        case "tooltipConnecting":
            return i18n("Connecting …");
        case "tooltipOn":
            return i18n("On · Brightness %1 %", argument);
        case "tooltipOff":
            return i18nc("@state", "Off");
        case "wsConnecting":
            return i18n("Connecting to Home Assistant…");
        case "wsAuthenticating":
            return i18n("Authenticating with Home Assistant…");
        case "wsConnectionLost":
            return i18n("Connection to Home Assistant lost.");
        case "wsCannotReach":
            return i18n("Cannot reach Home Assistant.");
        case "wsNotConfigured":
            return i18n("Home Assistant connection is not configured.");
        case "wsAuthTimedOut":
            return i18n("Authentication with Home Assistant timed out.");
        case "wsAuthRejected":
            return i18n("Home Assistant rejected the access token.");
        case "wsInvalidResponse":
            return i18n("Invalid response from Home Assistant.");
        case "wsNotConnected":
            return i18n("Not connected to Home Assistant.");
        case "wsRequestTimedOut":
            return i18n("Request to Home Assistant timed out.");
        case "wsRequestCancelled":
            return i18n("Request cancelled.");
        case "presetLoading":
            return i18n("Loading color presets…");
        case "presetWaitingLampState":
            return i18n("Waiting for the lamp state…");
        case "presetNotInRegistry":
            return i18n("This entity is not in the Home Assistant entity registry.");
        case "presetAccessDenied":
            return i18n("Home Assistant denied access to the entity registry.");
        case "presetRequestTimeout":
            return i18n("Request to Home Assistant timed out.");
        case "presetConnectionLost":
            return i18n("Connection to Home Assistant lost.");
        case "presetLoadFailed":
            return i18n("Could not load color presets from Home Assistant.");
        case "presetInvalidResponse":
            return i18n("Invalid response from Home Assistant.");
        case "presetInvalidList":
            return i18n("Invalid color presets in Home Assistant.");
        case "presetWriteNeedsAdmin":
            return i18n("Writing color presets requires an administrator token.");
        case "presetRejected":
            return i18n("Home Assistant rejected the color presets.");
        case "presetSaveFailed":
            return i18n("Could not save color presets in Home Assistant.");
        case "presetLampStateUnavailable":
            return i18n("The lamp state is unavailable; default color presets cannot be determined.");
        case "presetNotConfigured":
            return i18n("Home Assistant connection is not configured.");
        case "presetSaving":
            return i18n("Saving color presets to Home Assistant…");
        case "presetCannotSave":
            return i18n("The current color cannot be saved in Home Assistant.");
        case "presetCannotRemove":
            return i18n("This preset cannot be removed.");
        case "cfgLoadingLamps":
            return i18n("Loading lamps …");
        case "cfgNoLamps":
            return i18n("No lamps found.");
        case "cfgFoundLamps":
            return i18n("Found %1 lamps.", argument);
        case "cfgError":
            return i18n("Error: %1", argument);
        case "cfgTesting":
            return i18n("Testing …");
        case "cfgConnectedOn":
            return i18n("Connected – lamp is on.");
        case "cfgConnectedOff":
            return i18n("Connected – lamp is off.");
        case "cfgInvalidState":
            return i18n("Response without a valid state.");
        case "cfgCacheNone":
            return i18n("No cached color presets for this entity yet.");
        case "cfgCacheStatus":
            return i18np("Cached: %1 color, synced at %2",
                "Cached: %1 colors, synced at %2", argument.count, argument.date);
        case "cfgNever":
            return i18n("never");
        default:
            return "";
        }
    }
}
