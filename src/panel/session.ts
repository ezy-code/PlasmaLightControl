import { hsColor, isList } from "../colors/convert.ts";
import { canonical, canonicalList, normalize, normalizeList } from "../colors/spec.ts";
import type { LightColor } from "../colors/types.ts";
import type { HaError, LightServiceAttrs } from "../ha/types.ts";
import { text, strings } from "../shared/coerce.ts";
import { sourceKey } from "../ha/sourceKey.ts";
import {
    cleanMeta,
    decodeMeta,
    decodePresets,
    encodeMeta,
    encodePresets,
    isCorruptJson,
    legacySpecs,
    localMeta,
} from "../presets/cache.ts";
import {
    currentSpecForSync,
    hasPreset,
    indexOfHexSpec,
    presetHexes,
    presetItems,
    sameStringList,
    specsFromHex,
} from "../presets/list.ts";
import type { PresetItem } from "../presets/list.ts";
import { hexFromHs, hs01FromSpec, neutralLampState, parseLampState } from "./lampState.ts";
import type { LampValues } from "./lampState.ts";
import type { PanelTextKey } from "../i18n/textKeys.ts";

// Same fields as HaConfig, but "unset" stays a string, so no coercion is needed.
export interface HaConnection {
    url: string;
    token: string;
    entityId: string;
    timeout: number;
    scope: string;
}

/** The configuration keys the widget stores in KConfig. */
export interface PanelConfig {
    url: string;
    token: string;
    entityId: string;
    pollInterval: number;
    syncPresets: boolean;
    localPresets: string[];
    cachedPresetsJson: string;
    cachedMetaJson: string;
}

/** States PresetSync.qml reports, plus "cached" and "off" from the session. */
export type SyncState =
    | "off"
    | "connecting"
    | "auth"
    | "syncing"
    | "synced"
    | "readonly"
    | "cached"
    | "unsupported"
    | "error";

export type { PanelTextKey };

/** The preset component behind the Loader, or null while it is not ready. */
export interface SyncModule {
    queueAdd(spec: unknown): boolean;
    queueRemove(spec: unknown): boolean;
    retryNow(): void;
}

// Everything the session cannot own: main.qml implements it, the tests use a fake.
export interface PanelHost {
    config(): PanelConfig;
    setLocalPresets(value: string[]): void;
    setCachedPresetsJson(value: string): void;
    setCachedMetaJson(value: string): void;
    createRequestScope(): string;
    fetchState(cfg: HaConnection, onSuccess: (state: unknown) => void, onError: (error: HaError) => void): void;
    turnOn(
        cfg: HaConnection,
        attributes: LightServiceAttrs,
        onSuccess?: () => void,
        onError?: (error: HaError) => void,
    ): void;
    toggle(cfg: HaConnection, onSuccess?: () => void, onError?: (error: HaError) => void): void;
    cancelRequests(scope: string, method?: string): void;
    /** ErrorMessages.qml: maps an HaError or a { code, detail } object to text. */
    errorText(error: unknown): string;
    translate(key: PanelTextKey, argument?: unknown): string;
    render(snapshot: PanelSnapshot): void;
    callLater(callback: () => void): void;
    restartRefreshTimer(): void;
    startColorTimer(delayMs: number): void;
    stopColorTimer(): void;
    /** Wall clock in seconds. */
    now(): number;
    syncModule(): SyncModule | null;
    reloadSync(): void;
}

/** The lamp attributes PresetSync.qml needs to compute its defaults. */
export interface LightAttributes {
    supported_color_modes: unknown[];
    min_color_temp_kelvin: number;
    max_color_temp_kelvin: number;
}

// One snapshot of what main.qml mirrors into its properties.
export interface PanelSnapshot {
    connection: HaConnection;
    configured: boolean;
    pollIntervalSeconds: number;
    requestTimeout: number;
    lightAttributes: LightAttributes;

    lightOn: boolean;
    brightness: number;
    hue01: number;
    saturation01: number;
    colorTempKelvin: number;
    minKelvin: number;
    maxKelvin: number;
    supportsColor: boolean;
    supportsColorTemp: boolean;
    supportsEffect: boolean;
    effectList: unknown[];
    currentEffect: string;
    supportedColorModes: unknown[];
    currentColorSpec: LightColor | null;
    lightStateKnown: boolean;

    displayName: string;
    statusText: string;
    connected: boolean;
    available: boolean;

    presetItems: PresetItem[];
    syncEnabled: boolean;
    cachedSourceKey: string;
    activeSourceKey: string;
    syncWritable: boolean;
    syncState: SyncState;
    syncStatusText: string;
    syncAdmin: boolean;
    syncHasData: boolean;
    syncRetryable: boolean;
    cachedPresets: LightColor[];
    cachedMeta: unknown;
    cachedAvailable: boolean;

    toolTipMainText: string;
    toolTipSubText: string;
}

export interface PanelSession {
    start(): void;
    setConfig(config: PanelConfig): void;
    snapshot(): PanelSnapshot;
    refresh(): void;
    cancelPendingRequests(): void;
    toggleLight(): void;
    previewBrightness(value: number): void;
    previewColor(hue: number, saturation: number): void;
    scheduleColor(hue: number, saturation: number): void;
    applyScheduledColor(): void;
    previewColorTemp(kelvin: number): void;
    setBrightness(value: number): void;
    setColor(hue: number, saturation: number): void;
    setColorTemp(kelvin: number): void;
    setEffect(effect: string): void;
    flashLight(): void;
    applyPreset(spec: unknown): void;
    addCurrentPreset(): void;
    removePreset(index: number): void;
    retrySync(): void;
    handlePresetsPulled(presets: unknown, meta: unknown): void;
    handlePresetsPushed(presets: unknown, meta: unknown): void;
    handleStatusChanged(state: unknown, message: unknown): void;
    handleAuthFailed(message: unknown): void;
    handleWriteForbidden(message: unknown): void;
    handlePermissionChanged(admin: unknown): void;
    loaderFailed(detail: unknown): void;
    loaderReady(): void;
}

interface LiveLamp {
    available: boolean;
    lightOn: boolean;
    brightness: number;
    hue01: number;
    saturation01: number;
    colorTempKelvin: number;
    minKelvin: number;
    maxKelvin: number;
    supportsColor: boolean;
    supportsColorTemp: boolean;
    supportedColorModes: unknown[];
    effectList: unknown[];
    currentEffect: string;
    currentColorSpec: LightColor | null;
    lightStateKnown: boolean;
}

const KNOWN_STATES: SyncState[] = [
    "off",
    "connecting",
    "auth",
    "syncing",
    "synced",
    "readonly",
    "cached",
    "unsupported",
    "error",
];

function toSyncState(value: unknown): SyncState {
    const text = String(value || "");
    for (const state of KNOWN_STATES) {
        if (state === text)
            return state;
    }
    return "error";
}

function copyConfig(source: PanelConfig): PanelConfig {
    return {
        url: text(source.url),
        token: text(source.token),
        entityId: text(source.entityId),
        pollInterval: Number(source.pollInterval) || 0,
        syncPresets: source.syncPresets === true,
        localPresets: strings(source.localPresets),
        cachedPresetsJson: text(source.cachedPresetsJson),
        cachedMetaJson: text(source.cachedMetaJson),
    };
}

function emptyConfig(): PanelConfig {
    return copyConfig({
        url: "",
        token: "",
        entityId: "",
        pollInterval: 15,
        syncPresets: false,
        localPresets: [],
        cachedPresetsJson: "",
        cachedMetaJson: "",
    });
}

function neutralLamp(): LiveLamp {
    return {
        available: true,
        lightOn: false,
        brightness: 0,
        hue01: 0,
        saturation01: 0,
        colorTempKelvin: 3500,
        minKelvin: 2000,
        maxKelvin: 6500,
        supportsColor: false,
        supportsColorTemp: false,
        supportedColorModes: [],
        effectList: [],
        currentEffect: "",
        currentColorSpec: null,
        lightStateKnown: false,
    };
}

/** Writes the values a parsed state actually reported, keeping the rest. */
function applyLampValues(target: LiveLamp, values: LampValues): void {
    target.available = values.available;
    target.lightOn = values.lightOn;
    target.supportsColor = values.supportsColor;
    target.supportsColorTemp = values.supportsColorTemp;
    target.supportedColorModes = values.supportedColorModes;
    target.effectList = values.effectList;
    target.currentColorSpec = values.currentColorSpec;

    if (values.brightness !== undefined)
        target.brightness = values.brightness;
    if (values.currentEffect !== undefined)
        target.currentEffect = values.currentEffect;
    if (values.minKelvin !== undefined)
        target.minKelvin = values.minKelvin;
    if (values.maxKelvin !== undefined)
        target.maxKelvin = values.maxKelvin;
    if (values.colorTempKelvin !== undefined)
        target.colorTempKelvin = values.colorTempKelvin;
    if (values.hue01 !== undefined)
        target.hue01 = values.hue01;
    if (values.saturation01 !== undefined)
        target.saturation01 = values.saturation01;
}

// Snapshot before start(): full shape, so every mirrored property is defined.
export function initialSnapshot(): PanelSnapshot {
    const lamp = neutralLamp();
    return {
        connection: { url: "", token: "", entityId: "", timeout: 0, scope: "" },
        configured: false,
        pollIntervalSeconds: 3,
        requestTimeout: 2000,
        lightAttributes: {
            supported_color_modes: [],
            min_color_temp_kelvin: lamp.minKelvin,
            max_color_temp_kelvin: lamp.maxKelvin,
        },
        lightOn: lamp.lightOn,
        brightness: lamp.brightness,
        hue01: lamp.hue01,
        saturation01: lamp.saturation01,
        colorTempKelvin: lamp.colorTempKelvin,
        minKelvin: lamp.minKelvin,
        maxKelvin: lamp.maxKelvin,
        supportsColor: lamp.supportsColor,
        supportsColorTemp: lamp.supportsColorTemp,
        supportsEffect: false,
        effectList: [],
        currentEffect: "",
        supportedColorModes: [],
        currentColorSpec: null,
        lightStateKnown: false,
        displayName: "",
        statusText: "",
        connected: false,
        available: true,
        presetItems: [],
        syncEnabled: false,
        cachedSourceKey: "",
        activeSourceKey: "",
        syncWritable: false,
        syncState: "off",
        syncStatusText: "",
        syncAdmin: false,
        syncHasData: false,
        syncRetryable: true,
        cachedPresets: [],
        cachedMeta: {},
        cachedAvailable: false,
        toolTipMainText: "",
        toolTipSubText: "",
    };
}

// Widget state machine; every side effect goes through the host, then render().
export function createSession(host: PanelHost): PanelSession {
    const COLOR_APPLY_DELAY_MS = 200;
    const scope = host.createRequestScope();

    let started = false;
    let config = emptyConfig();
    let localPresets: string[] = [];

    const lamp = neutralLamp();
    let displayName = "";
    let statusText = "";
    let connected = false;
    let scheduledColor: { hue: number; saturation: number } | null = null;

    // One request at a time; extra triggers coalesce into a single follow-up.
    let stateRequestId = 0;
    let stateRequestInFlight = false;
    let stateRefreshPending = false;

    let syncState: SyncState = "off";
    let syncStatusText = "";
    let syncAdmin = false;
    let syncHasData = false;
    let syncRetryable = true;
    let cachedPresets: LightColor[] = [];
    let cachedMeta: unknown = {};
    let cacheUsable = false;
    let serverPresets: LightColor[] = [];
    let serverKnown = false;
    let cachedPresetsSource = "";

    let snapshotMemo: PanelSnapshot | null = null;
    let connectionMemo: HaConnection | null = null;
    let attributesMemo: LightAttributes | null = null;
    let attributesKey = "";
    let presetItemsMemo: PresetItem[] = [];
    let presetItemsMemoKey = "";
    let tooltipMemo: { key: string; main: string; sub: string } | null = null;

    function pollIntervalSeconds(): number {
        return Math.max(3, config.pollInterval);
    }

    // Keep the timeout below the poll interval.
    function requestTimeout(): number {
        return Math.max(2000, Math.min(pollIntervalSeconds() * 1000 - 500, 15000));
    }

    function configured(): boolean {
        return Boolean(config.url && config.token && config.entityId);
    }

    function connection(): HaConnection {
        const timeout = requestTimeout();
        const current = connectionMemo;
        if (current && current.url === config.url && current.token === config.token
                && current.entityId === config.entityId && current.timeout === timeout)
            return current;

        connectionMemo = {
            url: config.url,
            token: config.token,
            entityId: config.entityId,
            timeout: timeout,
            scope: scope,
        };
        return connectionMemo;
    }

    function syncEnabled(): boolean {
        return config.syncPresets === true && configured();
    }

    function currentSourceKey(): string {
        return sourceKey(config.url, config.entityId);
    }

    function activeSourceKey(): string {
        return syncEnabled() ? currentSourceKey() : "";
    }

    function syncWritable(): boolean {
        return syncEnabled() && syncAdmin && syncHasData && syncState === "synced";
    }

    /** Stable identity, so the PresetSync bindings are not re-evaluated per render. */
    function lightAttributes(): LightAttributes {
        const modes = lamp.supportedColorModes.map(String).join(",");
        const key = `${modes}|${lamp.minKelvin}|${lamp.maxKelvin}`;
        if (attributesMemo && key === attributesKey)
            return attributesMemo;

        attributesMemo = {
            supported_color_modes: lamp.supportedColorModes,
            min_color_temp_kelvin: lamp.minKelvin,
            max_color_temp_kelvin: lamp.maxKelvin,
        };
        attributesKey = key;
        return attributesMemo;
    }

    // Sync cache when valid, nothing for a foreign cache, the local hex list otherwise.
    function presetSpecs(): LightColor[] {
        if (syncEnabled() && cacheUsable)
            return cachedPresets;
        if (syncEnabled() && cachedPresetsSource.length > 0 && cachedPresetsSource !== currentSourceKey())
            return [];
        return specsFromHex(localPresets);
    }

    /** Stable identity for the ListView model: a new array only on a real change. */
    function visiblePresets(): PresetItem[] {
        const specs = presetSpecs();
        const key = canonicalList(specs);
        if (key === presetItemsMemoKey)
            return presetItemsMemo;

        presetItemsMemo = presetItems(specs);
        presetItemsMemoKey = key;
        return presetItemsMemo;
    }

    // No i18n() in a bundle: translate through the host; memo avoids re-translating.
    function tooltip(): { main: string; sub: string } {
        const main = displayName || config.entityId || host.translate("title");
        const hint = host.translate("tooltipHint");

        let sub: string;
        if (!configured())
            sub = host.translate("tooltipNotConfigured");
        else if (!connected)
            sub = `${statusText || host.translate("tooltipConnecting")}\n${hint}`;
        else if (lamp.lightOn)
            sub = `${host.translate("tooltipOn", Math.round(lamp.brightness / 255 * 100))}\n${hint}`;
        else
            sub = `${host.translate("tooltipOff")}\n${hint}`;

        const key = [main, sub].join("\u0000");
        if (tooltipMemo && tooltipMemo.key === key)
            return tooltipMemo;

        tooltipMemo = { key: key, main: main, sub: sub };
        return tooltipMemo;
    }

    function buildSnapshot(): PanelSnapshot {
        const haConnection = connection();
        const tips = tooltip();

        return {
            connection: haConnection,
            configured: configured(),
            pollIntervalSeconds: pollIntervalSeconds(),
            requestTimeout: requestTimeout(),
            lightAttributes: lightAttributes(),

            lightOn: lamp.lightOn,
            brightness: lamp.brightness,
            hue01: lamp.hue01,
            saturation01: lamp.saturation01,
            colorTempKelvin: lamp.colorTempKelvin,
            minKelvin: lamp.minKelvin,
            maxKelvin: lamp.maxKelvin,
            supportsColor: lamp.supportsColor,
            supportsColorTemp: lamp.supportsColorTemp,
            supportsEffect: lamp.effectList.length > 0,
            effectList: lamp.effectList,
            currentEffect: lamp.currentEffect,
            supportedColorModes: lamp.supportedColorModes,
            currentColorSpec: lamp.currentColorSpec,
            lightStateKnown: lamp.lightStateKnown,

            displayName: displayName,
            statusText: statusText,
            connected: connected,
            available: lamp.available,

            presetItems: visiblePresets(),
            syncEnabled: syncEnabled(),
            cachedSourceKey: currentSourceKey(),
            activeSourceKey: activeSourceKey(),
            syncWritable: syncWritable(),
            syncState: syncState,
            syncStatusText: syncStatusText,
            syncAdmin: syncAdmin,
            syncHasData: syncHasData,
            syncRetryable: syncRetryable,
            cachedPresets: cachedPresets,
            cachedMeta: cachedMeta,
            cachedAvailable: cacheUsable,

            toolTipMainText: tips.main,
            toolTipSubText: tips.sub,
        };
    }

    function render(): void {
        snapshotMemo = buildSnapshot();
        host.render(snapshotMemo);
    }

    function snapshot(): PanelSnapshot {
        if (!snapshotMemo)
            snapshotMemo = buildSnapshot();
        return snapshotMemo;
    }

    function finishStateRequest(): void {
        stateRequestInFlight = false;
        if (stateRefreshPending) {
            stateRefreshPending = false;
            host.callLater(refresh);
        }
    }

    function refresh(): void {
        if (!configured()) {
            stateRequestInFlight = false;
            stateRefreshPending = false;
            connected = false;
            statusText = host.translate("notConfigured");
            render();
            return;
        }

        if (stateRequestInFlight) {
            stateRefreshPending = true;
            return;
        }

        const requestId = ++stateRequestId;
        stateRequestInFlight = true;

        host.fetchState(connection(), function (state): void {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = true;
            statusText = "";
            applyState(state);
            render();
        }, function (error): void {
            if (requestId !== stateRequestId)
                return;
            finishStateRequest();
            connected = false;
            statusText = host.errorText(error);
            render();
        });
    }

    // Drop in-flight requests after a config change.
    function cancelPendingRequests(): void {
        host.cancelRequests(scope, "GET");
        ++stateRequestId;
        stateRequestInFlight = false;
        stateRefreshPending = false;
    }

    function applyState(state: unknown): void {
        const parsed = parseLampState(state, config.entityId, {
            supportsColor: lamp.supportsColor,
            hue01: lamp.hue01,
            saturation01: lamp.saturation01,
        });
        if (!parsed)
            return;

        displayName = parsed.displayName;
        applyLampValues(lamp, parsed);
        // Unavailable/unknown lamps have no state the defaults could derive from.
        lamp.lightStateKnown = parsed.available;
    }

    // After a URL/entity change the old values must not leak into defaults or the wheel.
    function resetLampState(): void {
        applyLampValues(lamp, neutralLampState());
        lamp.lightStateKnown = false;
    }

    function reportError(error: HaError): void {
        statusText = host.errorText(error);
        render();
    }

    function toggleLight(): void {
        cancelScheduledColor();
        if (!configured())
            return;

        host.toggle(connection(), function (): void {
            // Short delay so Home Assistant has applied the new state.
            host.restartRefreshTimer();
            lamp.lightOn = !lamp.lightOn;
            render();
        }, reportError);
    }

    function previewBrightness(value: number): void {
        lamp.brightness = value;
        render();
    }

    function previewColor(hue: number, saturation: number): void {
        lamp.hue01 = hue;
        lamp.saturation01 = saturation;
        render();
    }

    function scheduleColor(hue: number, saturation: number): void {
        previewColor(hue, saturation);
        scheduledColor = { hue: hue, saturation: saturation };
        host.startColorTimer(COLOR_APPLY_DELAY_MS);
    }

    function cancelScheduledColor(): void {
        if (!scheduledColor)
            return;
        scheduledColor = null;
        host.stopColorTimer();
    }

    function applyScheduledColor(): void {
        const color = scheduledColor;
        scheduledColor = null;
        host.stopColorTimer();
        if (color)
            setColor(color.hue, color.saturation);
    }

    function previewColorTemp(kelvin: number): void {
        lamp.colorTempKelvin = kelvin;
        render();
    }

    function setBrightness(value: number): void {
        lamp.brightness = value;
        render();
        if (!configured())
            return;

        host.turnOn(connection(), { brightness: Math.round(value), transition: 0.4 }, function (): void {
            lamp.lightOn = true;
            render();
        }, reportError);
    }

    function setColor(hue: number, saturation: number): void {
        cancelScheduledColor();
        lamp.hue01 = hue;
        lamp.saturation01 = saturation;
        const spec = hsColor(hue * 360, saturation * 100);
        lamp.currentColorSpec = spec;
        render();
        if (!configured())
            return;

        host.turnOn(connection(), { hs_color: spec.hs_color, transition: 0.4 }, function (): void {
            lamp.lightOn = true;
            render();
        }, reportError);
    }

    function setColorTemp(kelvin: number): void {
        cancelScheduledColor();
        lamp.colorTempKelvin = kelvin;
        lamp.currentColorSpec = { color_temp_kelvin: Math.round(kelvin) };
        render();
        if (!configured())
            return;

        host.turnOn(connection(), { color_temp_kelvin: Math.round(kelvin), transition: 0.4 }, function (): void {
            lamp.lightOn = true;
            render();
        }, reportError);
    }

    function setEffect(effect: string): void {
        lamp.currentEffect = effect;
        render();
        if (!configured())
            return;

        host.turnOn(connection(), { effect: effect, transition: 0.4 }, function (): void {
            lamp.lightOn = true;
            render();
        }, reportError);
    }

    function flashLight(): void {
        if (!configured())
            return;

        host.turnOn(connection(), { flash: "short" }, undefined, reportError);
    }

    function applyPreset(spec: unknown): void {
        const normalized = normalize(spec);
        if (!normalized || !configured())
            return;

        cancelScheduledColor();
        const attributes: LightServiceAttrs = { transition: 0.4 };
        const record = normalized as unknown as Record<string, unknown>;
        for (const key of Object.keys(record))
            attributes[key] = record[key];

        host.turnOn(connection(), attributes, function (): void {
            lamp.lightOn = true;
            lamp.currentColorSpec = normalized;
            applySpecToUi(normalized);
            render();
        }, reportError);
    }

    function applySpecToUi(spec: LightColor): void {
        if ("hs_color" in spec) {
            lamp.hue01 = spec.hs_color[0] / 360;
            lamp.saturation01 = spec.hs_color[1] / 100;
            return;
        }
        if ("color_temp_kelvin" in spec) {
            lamp.colorTempKelvin = spec.color_temp_kelvin;
            return;
        }

        const hs = hs01FromSpec(spec);
        if (!hs)
            return;
        lamp.hue01 = hs.hue01;
        lamp.saturation01 = hs.saturation01;
    }

    function writeLocalPresets(list: string[]): void {
        localPresets = list.slice();
        config = { ...config, localPresets: localPresets.slice() };
        host.setLocalPresets(localPresets.slice());
    }

    function writeColorPresets(json: string): void {
        config = { ...config, cachedPresetsJson: json };
        host.setCachedPresetsJson(json);
    }

    function writeColorPresetsMeta(json: string): void {
        config = { ...config, cachedMetaJson: json };
        host.setCachedMetaJson(json);
    }

    function updateLocalMirror(list: string[]): void {
        writeColorPresets(encodePresets(specsFromHex(list)));
        writeColorPresetsMeta(encodeMeta(localMeta()));
        cachedPresetsSource = "";
    }

    function addLocalCurrentColor(): void {
        const hex = hexFromHs(lamp.hue01, lamp.saturation01);
        const list = localPresets.slice();
        if (list.indexOf(hex) === -1) {
            list.push(hex);
            writeLocalPresets(list);
            updateLocalMirror(list);
        }
        render();
    }

    function removeLocalPreset(index: number): void {
        const item = visiblePresets()[index];
        if (!item)
            return;

        // presetItems skips invalid entries, so match on the displayed color instead.
        const list = localPresets.slice();
        const found = indexOfHexSpec(list, item.spec);
        if (found < 0)
            return;

        list.splice(found, 1);
        writeLocalPresets(list);
        updateLocalMirror(list);
        render();
    }

    function setSyncStatus(state: SyncState, message: string): void {
        syncState = state;
        if (state === "off") {
            syncStatusText = "";
            return;
        }

        const detail = message || "";
        syncStatusText = detail.length > 0 ? detail : defaultSyncStatusText(state);
    }

    // Only place a sync state becomes text; message details win over these defaults.
    function defaultSyncStatusText(state: SyncState): string {
        switch (state) {
        case "connecting":
            return cacheUsable ? host.translate("syncWaiting") : host.translate("syncConnecting");
        case "auth":
            return cacheUsable ? host.translate("syncWaiting") : host.translate("syncAuthenticating");
        case "syncing":
            return host.translate("syncSyncing");
        case "synced":
            return host.translate("syncSynced");
        case "readonly":
            return host.translate("syncReadonly");
        case "cached":
            return host.translate("syncWaiting");
        case "unsupported":
            return host.translate("syncUnsupported");
        case "error":
            return host.translate("syncFailed");
        default:
            return "";
        }
    }

    function persistPresets(presets: unknown, meta: unknown): void {
        const list = normalizeList(presets || []);
        const clean = cleanMeta(meta, currentSourceKey(), Math.floor(host.now()));
        const listJson = encodePresets(list);
        const metaJson = encodeMeta(clean);

        if (config.cachedPresetsJson !== listJson)
            writeColorPresets(listJson);
        if (config.cachedMetaJson !== metaJson)
            writeColorPresetsMeta(metaJson);

        const hexList = presetHexes(list);
        if (!sameStringList(localPresets, hexList))
            writeLocalPresets(hexList);

        cachedPresets = list;
        cachedMeta = clean;
        cacheUsable = true;
        syncHasData = true;
        cachedPresetsSource = clean.source || "";
    }

    function loadCachedPresets(): void {
        cachedPresets = [];
        cachedMeta = {};
        cacheUsable = false;
        serverPresets = [];
        // The cache is a local mirror, not the confirmed server state.
        serverKnown = false;

        if (!syncEnabled())
            return;

        const metaJson = config.cachedMetaJson || "{}";
        const presetsJson = config.cachedPresetsJson || "[]";
        const meta = decodeMeta(metaJson);
        const presets = decodePresets(presetsJson, meta, currentSourceKey());
        if (!presets || !meta) {
            if (isCorruptJson(metaJson) || isCorruptJson(presetsJson))
                console.warn("Could not read cached presets: corrupt cache data");
            return;
        }

        cachedPresets = presets;
        cachedMeta = meta;
        cacheUsable = true;
        syncHasData = true;
        cachedPresetsSource = meta.source;
        setSyncStatus("cached", "");
    }

    function migrateLocalPresets(): void {
        if (config.cachedPresetsJson.length > 0)
            return;

        const specs = legacySpecs(config.localPresets);
        if (specs.length === 0)
            return;

        writeColorPresets(encodePresets(specs));
        writeColorPresetsMeta(encodeMeta(localMeta()));
        cachedPresetsSource = "";
    }

    /** The source of a sync payload; only a string from the component counts. */
    function metaSource(meta: unknown): string {
        if (!meta || typeof meta !== "object")
            return "";
        const source = (meta as { source?: unknown }).source;
        return typeof source === "string" ? source : "";
    }

    function applyPresetsFromSync(presets: unknown, meta: unknown): void {
        if (!syncEnabled())
            return;
        // Never store a response for the previous URL/entity under the new source.
        if (metaSource(meta) !== currentSourceKey())
            return;

        const server = meta && isList((meta as { serverPresets?: unknown }).serverPresets)
            ? (meta as { serverPresets: unknown }).serverPresets
            : presets;
        serverPresets = normalizeList(server);
        serverKnown = true;
        persistPresets(presets, meta);
        render();
    }

    function restoreServerPresets(): void {
        // No confirmed server state yet: keep the optimistic list and report instead.
        if (!serverKnown) {
            setSyncStatus("error", host.translate("syncRestoreFailed"));
            return;
        }
        persistPresets(serverPresets, cachedMeta);
    }

    function addCurrentPreset(): void {
        if (!syncEnabled()) {
            addLocalCurrentColor();
            return;
        }

        const item = host.syncModule();
        if (!syncWritable() || !item)
            return;

        const spec = currentSpecForSync(lamp.currentColorSpec, lamp.supportsColor, lamp.hue01, lamp.saturation01);
        if (!spec) {
            setSyncStatus(syncState, host.translate("syncSaveUnsupported"));
            render();
            return;
        }

        if (hasPreset(presetSpecs(), spec)) {
            setSyncStatus(syncState, host.translate("syncAlreadySaved"));
            render();
            return;
        }

        const list = cachedPresets.slice();
        list.push(spec);
        cachedPresets = normalizeList(list);
        syncHasData = true;
        setSyncStatus(syncState, host.translate("syncSaving"));
        render();

        if (!item.queueAdd(spec)) {
            restoreServerPresets();
            render();
        }
    }

    function removePreset(index: number): void {
        if (!syncEnabled()) {
            removeLocalPreset(index);
            return;
        }

        const item = host.syncModule();
        if (!syncWritable() || !item)
            return;

        const preset = visiblePresets()[index];
        if (!preset)
            return;

        const list = cachedPresets.slice();
        const key = canonical(preset.spec);
        for (let i = 0; i < list.length; ++i) {
            if (canonical(list[i]) === key) {
                list.splice(i, 1);
                break;
            }
        }
        cachedPresets = normalizeList(list);
        setSyncStatus(syncState, host.translate("syncSaving"));
        render();

        if (!item.queueRemove(preset.spec)) {
            restoreServerPresets();
            render();
        }
    }

    function sourceKeysChanged(): void {
        syncAdmin = false;
        syncHasData = false;
        cacheUsable = false;
        cachedPresets = [];
        cachedMeta = {};
        serverPresets = [];
        serverKnown = false;

        if (activeSourceKey().length > 0) {
            loadCachedPresets();
            if (!cacheUsable)
                setSyncStatus("connecting", "");
        } else {
            setSyncStatus("off", "");
        }
    }

    function handlePermissionChanged(admin: unknown): void {
        syncAdmin = admin === true;
        render();
    }

    function handleWriteForbidden(message: unknown): void {
        syncAdmin = false;
        restoreServerPresets();
        setSyncStatus("readonly", text(message));
        render();
    }

    function handleAuthFailed(message: unknown): void {
        syncAdmin = false;
        setSyncStatus("error", text(message));
        render();
    }

    function handleStatusChanged(state: unknown, message: unknown): void {
        setSyncStatus(toSyncState(state), text(message));
        render();
    }

    function retrySync(): void {
        if (!syncEnabled())
            return;

        const item = host.syncModule();
        if (!item) {
            // Nothing to retry: reload, unless the failure is permanent.
            if (!syncRetryable)
                return;
            setSyncStatus("connecting", "");
            render();
            host.reloadSync();
            return;
        }

        setSyncStatus("connecting", "");
        render();
        item.retryNow();
        refresh();
    }

    function loaderFailed(detail: unknown): void {
        const message = text(detail);
        // Only a missing module is permanent; anything else may be fixed by reloading.
        const noWebSockets = /qt\s*websockets/i.test(message);
        syncAdmin = false;
        syncRetryable = !noWebSockets;
        setSyncStatus("error", noWebSockets
            ? host.errorText({ code: "syncNoWebSockets" })
            : host.errorText({ code: "syncLoadError", detail: message }));
        render();
    }

    function loaderReady(): void {
        syncRetryable = true;
        render();
    }

    function setConfig(next: PanelConfig): void {
        const previous = config;
        const nextConfig = copyConfig(next);

        if (!started) {
            config = nextConfig;
            localPresets = nextConfig.localPresets.slice();
            return;
        }

        config = nextConfig;
        const connectionChanged = nextConfig.url !== previous.url
            || nextConfig.token !== previous.token
            || nextConfig.entityId !== previous.entityId
            || nextConfig.pollInterval !== previous.pollInterval;
        const sourceChanged = sourceKey(nextConfig.url, nextConfig.entityId)
            !== sourceKey(previous.url, previous.entityId);
        const syncFlagChanged = nextConfig.syncPresets !== previous.syncPresets;
        const externalColors = !sameStringList(nextConfig.localPresets, localPresets);
        if (externalColors)
            localPresets = nextConfig.localPresets.slice();

        if (connectionChanged || sourceChanged)
            cancelScheduledColor();
        if (connectionChanged)
            cancelPendingRequests();
        if (sourceChanged)
            resetLampState();
        if (sourceChanged || syncFlagChanged)
            sourceKeysChanged();

        if (connectionChanged || sourceChanged || syncFlagChanged || externalColors) {
            // Render before refetching: the reset lamp state must be visible at once.
            render();
            if (connectionChanged)
                refresh();
        }
    }

    function start(): void {
        if (started)
            return;
        started = true;
        config = copyConfig(host.config());
        localPresets = config.localPresets.slice();
        migrateLocalPresets();
        sourceKeysChanged();
        render();
    }

    return {
        start: start,
        setConfig: setConfig,
        snapshot: snapshot,
        refresh: refresh,
        cancelPendingRequests: cancelPendingRequests,
        toggleLight: toggleLight,
        previewBrightness: previewBrightness,
        previewColor: previewColor,
        scheduleColor: scheduleColor,
        applyScheduledColor: applyScheduledColor,
        previewColorTemp: previewColorTemp,
        setBrightness: setBrightness,
        setColor: setColor,
        setColorTemp: setColorTemp,
        setEffect: setEffect,
        flashLight: flashLight,
        applyPreset: applyPreset,
        addCurrentPreset: addCurrentPreset,
        removePreset: removePreset,
        retrySync: retrySync,
        handlePresetsPulled: applyPresetsFromSync,
        handlePresetsPushed: applyPresetsFromSync,
        handleStatusChanged: handleStatusChanged,
        handleAuthFailed: handleAuthFailed,
        handleWriteForbidden: handleWriteForbidden,
        handlePermissionChanged: handlePermissionChanged,
        loaderFailed: loaderFailed,
        loaderReady: loaderReady,
    };
}
