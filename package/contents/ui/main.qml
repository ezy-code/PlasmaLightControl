import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import "HomeAssistant.js" as HA
import "FavoriteColors.js" as Favorites
import "FavoritesShared.js" as FavoritesShared

PlasmoidItem {
    id: mainItem

    ErrorMessages { id: errorMessages }

    // --- Zustand der Lampe ---
    property bool lightOn: false
    property int brightness: 0          // 0..255 (Home-Assistant-Skala)
    property real hue: 0.0              // 0..1
    property real saturation: 0.0       // 0..1
    property int colorTempKelvin: 3500
    property int minKelvin: 2000
    property int maxKelvin: 6500
    property bool supportsColor: false
    property bool supportsColorTemp: false
    property bool supportsEffect: false
    property var effectList: []
    property string currentEffect: ""
    property var supportedColorModes: []
    property var currentColorSpec: null
    property bool lightStateKnown: false

    property string displayName: ""
    property string statusText: ""
    property bool connected: false
    property bool available: true

    // --- Favorite colors ---
    readonly property var presetItems: buildPresetItems()
    readonly property bool syncEnabled: Plasmoid.configuration.syncFavorites === true && configured
    readonly property string syncSource: FavoritesShared.sourceKey(cfg.url, cfg.entityId)
    readonly property string syncKey: syncEnabled ? syncSource : ""
    readonly property var lightAttributes: ({
        supported_color_modes: supportedColorModes,
        min_color_temp_kelvin: minKelvin,
        max_color_temp_kelvin: maxKelvin
    })
    readonly property bool syncWritable: syncEnabled && syncAdmin && syncHasData
        && syncState === "synced"

    property string syncState: "off"
    property string syncStatusText: ""
    property bool syncAdmin: false
    property bool syncHasData: false
    // False only for an unrecoverable Loader failure (missing Qt WebSockets);
    // a normal runtime sync error can always be retried.
    property bool syncRetryable: true
    property var cachedPresets: []
    property var cachedMeta: ({})
    property bool cacheValid: false
    property var confirmedPresets: []
    property bool confirmedKnown: false
    property string presetsSource: ""

    // --- Status polling ---
    // One request at a time; extra triggers coalesce into a single follow-up.
    property int stateRequestId: 0
    property bool stateRequestInFlight: false
    property bool stateRefreshPending: false

    readonly property int pollIntervalSeconds: Math.max(3, Plasmoid.configuration.pollInterval)
    // Keep the timeout below the poll interval.
    readonly property int requestTimeout: Math.max(2000, Math.min(pollIntervalSeconds * 1000 - 500, 15000))

    // Request namespace per widget instance.
    readonly property string requestScope: HA.createScope()

    readonly property var cfg: ({
        url: Plasmoid.configuration.haUrl,
        token: Plasmoid.configuration.haToken,
        entityId: Plasmoid.configuration.entityId,
        timeout: requestTimeout,
        scope: requestScope
    })

    readonly property bool configured: cfg.url && cfg.token && cfg.entityId

    Plasmoid.icon: Qt.resolvedUrl("../icons/light-on.svg")
    toolTipMainText: displayName || Plasmoid.configuration.entityId || i18n("Plasma Light Control")
    toolTipSubText: {
        const hint = i18n("Left-click: popup · Middle-click: toggle · Wheel: brightness");
        if (!configured)
            return i18n("Not configured – please set up the connection.");
        if (!connected)
            return (statusText || i18n("Connecting …")) + "\n" + hint;
        const stateText = lightOn
            ? i18n("On · Brightness %1 %", Math.round(brightness / 255 * 100))
            : i18nc("@state", "Off");
        return stateText + "\n" + hint;
    }

    // --- Statusabfrage ---
    function refresh() {
        if (!configured) {
            stateRequestInFlight = false;
            stateRefreshPending = false;
            connected = false;
            statusText = i18n("Not configured");
            return;
        }

        if (stateRequestInFlight) {
            stateRefreshPending = true;
            return;
        }

        const requestId = ++stateRequestId;
        stateRequestInFlight = true;

        HA.fetchState(cfg, function (state) {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = true;
            statusText = "";
            applyState(state);
        }, function (err) {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = false;
            statusText = errorMessages.text(err);
        });
    }

    function finishStateRequest() {
        stateRequestInFlight = false;
        if (stateRefreshPending) {
            stateRefreshPending = false;
            Qt.callLater(mainItem.refresh);
        }
    }

    // Drop in-flight requests after a config change.
    function cancelPendingRequests() {
        HA.cancelRequests(cfg.scope, "GET");
        ++stateRequestId;
        stateRequestInFlight = false;
        stateRefreshPending = false;
    }

    // Everything below is derived from one lamp. After a URL/entity change the
    // old values must not leak into defaults, capability checks or the wheel.
    function resetLampState() {
        lightStateKnown = false;
        supportedColorModes = [];
        supportsColor = false;
        supportsColorTemp = false;
        supportsEffect = false;
        currentColorSpec = null;
        effectList = [];
        currentEffect = "";
        available = true;
        // Neutral values: the old lamp's color must not leak into defaults or
        // the color wheel while the new entity has not answered yet.
        hue = 0;
        saturation = 0;
        brightness = 0;
        lightOn = false;
        colorTempKelvin = 3500;
        minKelvin = 2000;
        maxKelvin = 6500;
    }

    function applyState(state) {
        if (!state || !state.state)
            return;
        available = state.state !== "unavailable" && state.state !== "unknown";
        lightOn = (state.state === "on");
        const a = state.attributes || {};
        displayName = a.friendly_name || Plasmoid.configuration.entityId;

        if (a.brightness !== undefined && a.brightness !== null)
            brightness = a.brightness;

        // Batch the attribute updates: favorite-color defaults must only be
        // recomputed once modes and the Kelvin range are in place, never from
        // a half-updated lamp state.
        lightStateKnown = false;

        const modes = a.supported_color_modes || [];
        supportsColor = modes.indexOf("hs") >= 0 || modes.indexOf("rgb") >= 0
            || modes.indexOf("rgbw") >= 0 || modes.indexOf("rgbww") >= 0 || modes.indexOf("xy") >= 0;
        supportsColorTemp = modes.indexOf("color_temp") >= 0;
        supportedColorModes = modes;
        currentColorSpec = buildCurrentColorSpec(a);

        effectList = Array.isArray(a.effect_list) ? a.effect_list : [];
        supportsEffect = effectList.length > 0;
        if (typeof a.effect === "string")
            currentEffect = a.effect;

        if (a.min_color_temp_kelvin)
            minKelvin = a.min_color_temp_kelvin;
        if (a.max_color_temp_kelvin)
            maxKelvin = a.max_color_temp_kelvin;
        if (a.color_temp_kelvin)
            colorTempKelvin = a.color_temp_kelvin;

        if (a.hs_color && a.hs_color.length === 2) {
            hue = a.hs_color[0] / 360;
            saturation = a.hs_color[1] / 100;
        } else if (a.rgb_color && a.rgb_color.length === 3) {
            const c = Qt.rgba(a.rgb_color[0] / 255, a.rgb_color[1] / 255, a.rgb_color[2] / 255, 1);
            hue = c.hsvHue >= 0 ? c.hsvHue : 0;
            saturation = c.hsvSaturation;
        }

        // Only a reachable lamp has a state the defaults can be derived from;
        // unavailable/unknown must not publish an empty favorites list.
        lightStateKnown = available;
    }

    function buildCurrentColorSpec(attributes) {
        function isArray(key, length) {
            return Array.isArray(attributes[key]) && attributes[key].length === length;
        }

        let spec = null;
        const mode = attributes.color_mode;

        if (mode === "color_temp" && attributes.color_temp_kelvin !== undefined
                && attributes.color_temp_kelvin !== null) {
            spec = { color_temp_kelvin: attributes.color_temp_kelvin };
        } else if (mode === "rgbww" && isArray("rgbww_color", 5)) {
            spec = { rgbww_color: attributes.rgbww_color };
        } else if (mode === "rgbw" && isArray("rgbw_color", 4)) {
            spec = { rgbw_color: attributes.rgbw_color };
        } else if (mode === "rgb" && isArray("rgb_color", 3)) {
            spec = { rgb_color: attributes.rgb_color };
        } else if (mode === "hs" && isArray("hs_color", 2)) {
            spec = { hs_color: attributes.hs_color };
        } else if (mode === "xy") {
            if (isArray("hs_color", 2)) {
                spec = { hs_color: attributes.hs_color };
            } else if (isArray("xy_color", 2)) {
                const hs = Favorites.xyToHs(attributes.xy_color);
                if (hs)
                    spec = { hs_color: hs };
            }
        }

        if (!spec) {
            if (isArray("hs_color", 2))
                spec = { hs_color: attributes.hs_color };
            else if (isArray("rgb_color", 3))
                spec = { rgb_color: attributes.rgb_color };
            else if (attributes.color_temp_kelvin !== undefined
                     && attributes.color_temp_kelvin !== null)
                spec = { color_temp_kelvin: attributes.color_temp_kelvin };
            else if (isArray("rgbw_color", 4))
                spec = { rgbw_color: attributes.rgbw_color };
            else if (isArray("rgbww_color", 5))
                spec = { rgbww_color: attributes.rgbww_color };
            else if (supportsColor)
                spec = Favorites.hsColor(hue * 360, saturation * 100);
        }

        return Favorites.normalize(spec);
    }

    function buildPresetItems() {
        const useCache = syncEnabled && cacheValid;
        const staleSource = syncEnabled && !useCache && presetsSource.length > 0
            && presetsSource !== syncSource;
        const specs = useCache ? cachedPresets : (staleSource ? [] : localPresetSpecs());
        const items = [];
        for (let i = 0; i < specs.length; ++i) {
            const spec = Favorites.normalize(specs[i]);
            if (!spec)
                continue;
            items.push({ spec: spec, hex: Favorites.specToHex(spec) });
        }
        return items;
    }

    function localPresetSpecs(savedColors) {
        const result = [];
        const saved = Favorites.toList(savedColors)
            || Favorites.toList(Plasmoid.configuration.savedColors)
            || [];
        for (let i = 0; i < saved.length; ++i) {
            const spec = Favorites.fromHex(saved[i]);
            if (spec)
                result.push(spec);
        }
        return result;
    }

    function currentSpecForSync() {
        let spec = currentColorSpec;
        if (!spec && supportsColor)
            spec = Favorites.hsColor(hue * 360, saturation * 100);
        return Favorites.normalize(spec);
    }

    // Specs currently shown in the favorites row (cache or local mirror).
    function displayedPresetSpecs() {
        const result = [];
        for (let i = 0; i < presetItems.length; ++i)
            result.push(presetItems[i].spec);
        return result;
    }

    function hasFavorite(spec) {
        return Favorites.contains(displayedPresetSpecs(), spec);
    }

    function applyPreset(spec) {
        const normalized = Favorites.normalize(spec);
        if (!normalized || !configured)
            return;

        const attributes = { transition: 0.4 };
        for (const key in normalized)
            attributes[key] = normalized[key];

        HA.turnOn(cfg, attributes, function () {
            lightOn = true;
            currentColorSpec = normalized;
            applySpecToUi(normalized);
        }, function (err) {
            statusText = errorMessages.text(err);
        });
    }

    function applySpecToUi(spec) {
        if (spec.hs_color) {
            hue = spec.hs_color[0] / 360;
            saturation = spec.hs_color[1] / 100;
        } else if (spec.color_temp_kelvin !== undefined) {
            colorTempKelvin = spec.color_temp_kelvin;
        } else {
            const rgb = Favorites.specToRgb(spec);
            if (rgb) {
                const color = Qt.rgba(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
                hue = color.hsvHue >= 0 ? color.hsvHue : 0;
                saturation = color.hsvSaturation;
            }
        }
    }

    function addCurrentPreset() {
        if (!syncEnabled) {
            addLocalCurrentColor();
            return;
        }

        if (!syncWritable || !syncLoader.item)
            return;

        const spec = currentSpecForSync();
        if (!spec) {
            setSyncStatus("error", i18n("The current color cannot be saved in Home Assistant."));
            return;
        }

        if (hasFavorite(spec)) {
            setSyncStatus(syncState, i18n("This color is already in the favorites."));
            return;
        }

        const list = cachedPresets.slice();
        list.push(spec);
        cachedPresets = Favorites.normalizeList(list);
        syncHasData = true;
        setSyncStatus(syncState, i18n("Saving favorite colors to Home Assistant…"));

        if (!syncLoader.item.queueAdd(spec))
            restoreConfirmedPresets();
    }

    function removePreset(index) {
        if (!syncEnabled) {
            removeLocalPreset(index);
            return;
        }

        if (!syncWritable || !syncLoader.item)
            return;

        const item = presetItems[index];
        if (!item)
            return;

        const list = cachedPresets.slice();
        const key = Favorites.canonical(item.spec);
        for (let i = 0; i < list.length; ++i) {
            if (Favorites.canonical(list[i]) === key) {
                list.splice(i, 1);
                break;
            }
        }
        cachedPresets = Favorites.normalizeList(list);
        setSyncStatus(syncState, i18n("Saving favorite colors to Home Assistant…"));

        if (!syncLoader.item.queueRemove(item.spec))
            restoreConfirmedPresets();
    }

    function addLocalCurrentColor() {
        const color = Qt.hsva(hue, saturation, 1.0, 1.0);
        const hex = colorToHex(color);
        const list = Plasmoid.configuration.savedColors.slice();
        if (list.indexOf(hex) === -1) {
            list.push(hex);
            Plasmoid.configuration.savedColors = list;
            updateLocalMirror(list);
        }
    }

    function removeLocalPreset(index) {
        const item = presetItems[index];
        if (!item)
            return;

        // presetItems skips invalid entries from savedColors, so the index
        // cannot be used directly. Remove the entry matching the displayed
        // color instead.
        const key = Favorites.canonical(item.spec);
        const list = Plasmoid.configuration.savedColors.slice();
        let found = -1;
        for (let i = 0; i < list.length; ++i) {
            const spec = Favorites.fromHex(list[i]);
            if (spec && Favorites.canonical(spec) === key) {
                found = i;
                break;
            }
        }

        if (found < 0)
            return;

        list.splice(found, 1);
        Plasmoid.configuration.savedColors = list;
        updateLocalMirror(list);
    }

    function updateLocalMirror(savedColors) {
        const specs = localPresetSpecs(savedColors);
        Plasmoid.configuration.colorPresets = JSON.stringify(specs);
        Plasmoid.configuration.colorPresetsMeta = JSON.stringify({
            v: 1,
            source: "",
            origin: "local",
            modifiedAt: 0,
            syncedAt: 0
        });
        presetsSource = "";
    }

    function colorToHex(color) {
        function toHex(value) {
            const text = Math.round(value * 255).toString(16);
            return text.length === 1 ? "0" + text : text;
        }
        return "#" + toHex(color.r) + toHex(color.g) + toHex(color.b);
    }

    function persistPresets(presets, meta) {
        const list = Favorites.normalizeList(presets || []);
        const clean = cleanMeta(meta);
        const listJson = JSON.stringify(list);
        const metaJson = JSON.stringify(clean);

        if (Plasmoid.configuration.colorPresets !== listJson)
            Plasmoid.configuration.colorPresets = listJson;
        if (Plasmoid.configuration.colorPresetsMeta !== metaJson)
            Plasmoid.configuration.colorPresetsMeta = metaJson;

        const hexList = [];
        for (let i = 0; i < list.length; ++i) {
            const hex = Favorites.specToHex(list[i]);
            if (hex)
                hexList.push(hex);
        }
        if (!sameStrings(Plasmoid.configuration.savedColors, hexList))
            Plasmoid.configuration.savedColors = hexList;

        cachedPresets = list;
        cachedMeta = clean;
        cacheValid = true;
        syncHasData = true;
        presetsSource = clean.source || "";
    }

    function loadCachedPresets() {
        cachedPresets = [];
        cachedMeta = ({});
        cacheValid = false;
        confirmedPresets = [];
        // The cache is a local mirror, not the confirmed server state.
        confirmedKnown = false;

        if (!syncEnabled)
            return;

        try {
            const meta = JSON.parse(Plasmoid.configuration.colorPresetsMeta || "{}");
            if (!meta || meta.v !== 1 || meta.source !== syncSource)
                return;

            const raw = JSON.parse(Plasmoid.configuration.colorPresets || "[]");
            if (!Array.isArray(raw))
                return;

            cachedPresets = Favorites.normalizeList(raw);
            cachedMeta = meta;
            cacheValid = true;
            syncHasData = true;
            presetsSource = meta.source;
            setSyncStatus("cached", "");
        } catch (error) {
            console.warn("Could not read cached favorite colors: " + error);
        }
    }

    function migrateSavedColors() {
        if (String(Plasmoid.configuration.colorPresets || "").length > 0)
            return;

        const saved = Plasmoid.configuration.savedColors || [];
        if (saved.length === 0)
            return;

        const specs = [];
        for (let i = 0; i < saved.length; ++i) {
            const spec = Favorites.fromHex(saved[i]);
            if (spec)
                specs.push(spec);
        }
        if (specs.length === 0)
            return;

        Plasmoid.configuration.colorPresets = JSON.stringify(specs);
        Plasmoid.configuration.colorPresetsMeta = JSON.stringify({
            v: 1,
            source: "",
            origin: "local",
            modifiedAt: 0,
            syncedAt: 0
        });
        presetsSource = "";
    }

    function cleanMeta(meta) {
        const source = meta && typeof meta.source === "string" ? meta.source : "";
        const allowedOrigins = ["custom", "defaults", "empty", "local"];
        const origin = meta && allowedOrigins.indexOf(meta.origin) >= 0 ? meta.origin : "custom";
        return {
            v: 1,
            source: source || syncSource,
            origin: origin,
            modifiedAt: Number(meta && meta.modifiedAt) || 0,
            syncedAt: Number(meta && meta.syncedAt) || Math.floor(Date.now() / 1000)
        };
    }

    function sameStrings(first, second) {
        const firstList = Favorites.toList(first);
        const secondList = Favorites.toList(second);
        if (!firstList || !secondList)
            return false;
        if (firstList.length !== secondList.length)
            return false;
        for (let i = 0; i < firstList.length; ++i) {
            if (firstList[i] !== secondList[i])
                return false;
        }
        return true;
    }

    function applyPresetsFromSync(presets, meta) {
        if (!syncEnabled)
            return;
        const source = meta && typeof meta.source === "string" ? meta.source : "";
        // A response for the previous URL/entity may still be in flight when
        // the configuration changes. Never store it under the new source.
        if (source !== syncSource)
            return;
        const server = meta && Favorites.isList(meta.serverPresets) ? meta.serverPresets : presets;
        confirmedPresets = Favorites.normalizeList(server);
        confirmedKnown = true;
        persistPresets(presets, meta);
    }

    function handlePermissionChanged(admin) {
        syncAdmin = admin === true;
    }

    function handleWriteForbidden(message) {
        syncAdmin = false;
        restoreConfirmedPresets();
        setSyncStatus("readonly", message);
    }

    function handleAuthFailed(message) {
        syncAdmin = false;
        setSyncStatus("error", message);
    }

    function restoreConfirmedPresets() {
        // Never persist an empty list just because no confirmed server state
        // is known: keep the optimistic list and surface the problem instead.
        if (!confirmedKnown || !Favorites.isList(confirmedPresets)) {
            setSyncStatus("error",
                i18n("Could not restore the favorite colors; the current list was kept."));
            return;
        }
        persistPresets(confirmedPresets, cachedMeta);
    }

    function reloadSyncLoader() {
        if (!syncEnabled)
            return;
        // Reload through the source: `active` is bound to syncEnabled and must
        // stay untouched. Emptying it first makes the Loader actually create
        // the component again instead of keeping it in the Error state.
        syncLoader.source = "";
        Qt.callLater(function () {
            syncLoader.source = "FavoritesSync.qml";
        });
    }

    function retrySync() {
        if (!syncEnabled)
            return;

        if (!syncLoader.item) {
            // Without a component there is nothing to retry: reload it unless
            // the failure is known to be permanent (missing Qt WebSockets).
            if (!syncRetryable)
                return;
            setSyncStatus("connecting", "");
            reloadSyncLoader();
            return;
        }

        setSyncStatus("connecting", "");
        syncLoader.item.retryNow();
        refresh();
    }

    // The only place that maps a synchronization state to user-facing text.
    // FavoritesSync/HaWebSocket pass semantic details (timeouts, auth errors,
    // progress) through the message; those must win over these defaults.
    function defaultSyncStatusText(state) {
        switch (state) {
        case "connecting":
            return cacheValid
                ? i18n("Waiting for Home Assistant…")
                : i18n("Connecting to Home Assistant…");
        case "auth":
            return cacheValid
                ? i18n("Waiting for Home Assistant…")
                : i18n("Authenticating with Home Assistant…");
        case "syncing":
            return i18n("Syncing favorite colors…");
        case "synced":
            return i18n("Synced with Home Assistant");
        case "readonly":
            return i18n("Read-only: administrator token required");
        case "cached":
            return i18n("Waiting for Home Assistant…");
        case "unsupported":
            return i18n("Favorite colors are not supported for this entity.");
        case "error":
            return i18n("Could not sync favorite colors.");
        default:
            return "";
        }
    }

    function setSyncStatus(state, message) {
        syncState = state;
        if (state === "off") {
            syncStatusText = "";
            return;
        }

        const text = message || "";
        syncStatusText = text.length > 0 ? text : defaultSyncStatusText(state);
    }

    // --- Aktionen ---
    function toggleLight() {
        if (!configured)
            return;
        HA.toggle(cfg, function () {
            // Kurze Verzögerung, damit HA den neuen Zustand übernommen hat.
            refreshTimer.restart();
            lightOn = !lightOn; // optimistisches Update
        }, function (err) {
            statusText = errorMessages.text(err);
        });
    }

    function setBrightness(value) {
        brightness = value;
        if (!configured)
            return;
        HA.turnOn(cfg, { brightness: Math.round(value), transition: 0.4 }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function setColor(h, s) {
        hue = h;
        saturation = s;
        const spec = Favorites.hsColor(h * 360, s * 100);
        currentColorSpec = spec;
        if (!configured)
            return;
        HA.turnOn(cfg, { hs_color: spec.hs_color, transition: 0.4 }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function setColorTemp(kelvin) {
        colorTempKelvin = kelvin;
        currentColorSpec = { color_temp_kelvin: Math.round(kelvin) };
        if (!configured)
            return;
        HA.turnOn(cfg, { color_temp_kelvin: Math.round(kelvin), transition: 0.4 }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function setEffect(effect) {
        currentEffect = effect;
        if (!configured)
            return;
        HA.turnOn(cfg, { effect: effect, transition: 0.4 }, function () {
            lightOn = true;
        }, function (err) { statusText = errorMessages.text(err); });
    }

    function flashLight() {
        if (!configured)
            return;
        HA.turnOn(cfg, { flash: "short" }, null, function (err) {
            statusText = errorMessages.text(err);
        });
    }

    // --- Timer ---
    Timer {
        id: pollTimer
        interval: mainItem.pollIntervalSeconds * 1000
        running: mainItem.configured
        repeat: true
        triggeredOnStart: true
        onTriggered: mainItem.refresh()
    }

    Timer {
        id: refreshTimer
        interval: 600
        repeat: false
        onTriggered: mainItem.refresh()
    }

    onCfgChanged: {
        mainItem.cancelPendingRequests();
        mainItem.refresh();
    }

    // URL/entity changes: drop everything derived from the previous lamp and
    // fetch the new one instead of computing defaults from stale attributes.
    onSyncSourceChanged: {
        mainItem.resetLampState();
        mainItem.refresh();
    }

    onSyncKeyChanged: {
        mainItem.syncAdmin = false;
        mainItem.syncHasData = false;
        mainItem.cacheValid = false;
        mainItem.cachedPresets = [];
        mainItem.cachedMeta = ({});
        mainItem.confirmedPresets = [];
        mainItem.confirmedKnown = false;

        if (mainItem.syncKey.length > 0) {
            mainItem.loadCachedPresets();
            if (!mainItem.cacheValid)
                mainItem.setSyncStatus("connecting", "");
        } else {
            mainItem.setSyncStatus("off", "");
        }
    }

    Component.onCompleted: {
        mainItem.migrateSavedColors();
        if (mainItem.syncEnabled) {
            mainItem.loadCachedPresets();
            if (!mainItem.cacheValid)
                mainItem.setSyncStatus("connecting", "");
        } else {
            mainItem.setSyncStatus("off", "");
        }
    }

    Loader {
        id: syncLoader
        active: mainItem.syncEnabled
        source: "FavoritesSync.qml"

        onStatusChanged: {
            if (!active)
                return;

            if (status === Loader.Error) {
                const detail = String(errorString || "");
                // Only a missing module is permanent; syntax errors, missing
                // files and similar failures can be fixed by reloading.
                const noWebSockets = /qt\s*websockets/i.test(detail);
                mainItem.syncAdmin = false;
                mainItem.syncRetryable = !noWebSockets;
                mainItem.setSyncStatus("error", noWebSockets
                    ? errorMessages.text({ code: "syncNoWebSockets" })
                    : errorMessages.text({ code: "syncLoadError", detail: detail }));
            } else if (status === Loader.Ready) {
                mainItem.syncRetryable = true;
            }
        }
    }

    Binding {
        target: syncLoader.item
        property: "baseUrl"
        value: mainItem.cfg.url
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "token"
        value: mainItem.cfg.token
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "entityId"
        value: mainItem.cfg.entityId
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "active"
        value: mainItem.syncEnabled
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "cachedPresets"
        value: mainItem.cachedPresets
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "cachedMeta"
        value: mainItem.cachedMeta
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "cachedAvailable"
        value: mainItem.cacheValid
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "lightAttributes"
        value: mainItem.lightAttributes
        when: syncLoader.item !== null
    }
    Binding {
        target: syncLoader.item
        property: "lightStateKnown"
        value: mainItem.lightStateKnown
        when: syncLoader.item !== null
    }

    Connections {
        target: syncLoader.item

        function onPresetsPulled(presets, meta) {
            mainItem.applyPresetsFromSync(presets, meta);
        }
        function onPresetsPushed(presets, meta) {
            mainItem.applyPresetsFromSync(presets, meta);
        }
        function onStatusChanged(state, message) {
            mainItem.setSyncStatus(state, message);
        }
        function onAuthFailed(message) {
            mainItem.handleAuthFailed(message);
        }
        function onWriteForbidden(message) {
            mainItem.handleWriteForbidden(message);
        }
        function onPermissionChanged(admin) {
            mainItem.handlePermissionChanged(admin);
        }
    }

    // --- Repräsentationen ---
    preferredRepresentation: null // Plasma entscheidet je nach Panel

    compactRepresentation: CompactRepresentation {}
    fullRepresentation: FullRepresentation {}
}
