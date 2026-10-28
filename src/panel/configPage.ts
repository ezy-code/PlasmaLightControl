import { isList } from "../colors/convert.ts";
import { text, strings } from "../shared/coerce.ts";
import { sourceKey } from "../ha/sourceKey.ts";
import { decodeMeta, decodePresets, isCorruptJson } from "../presets/cache.ts";
import type { PanelTextKey } from "../i18n/textKeys.ts";

/** The configuration values the page reads; Plasma owns them (cfg_<Key>). */
export interface ConfigFields {
    url: string;
    token: string;
    entityId: string;
    localPresets: string[];
    cachedPresetsJson: string;
    cachedMetaJson: string;
}

export type ConfigTone = "neutral" | "positive" | "negative";

export interface ConfigLamp {
    label: string;
    entityId: string;
}

export interface ConfigPageSnapshot {
    loadingLamps: boolean;
    lamps: ConfigLamp[];
    selectedLampIndex: number;
    cacheStatus: string;
    testText: string;
    testTone: ConfigTone;
    webSocketsAvailable: boolean;
}

// What ConfigConnection.qml provides: cfg_<Key>, HA calls, probe, translate, render.
export interface ConfigPageHost {
    fields(): ConfigFields;
    fetchLights(cfg: { url: string; token: string; scope: string; timeout: number },
                onSuccess: (lamps: unknown) => void, onError: (error: unknown) => void): void;
    fetchState(cfg: { url: string; token: string; entityId: string },
               onSuccess: (state: unknown) => void, onError: (error: unknown) => void): void;
    errorText(error: unknown): string;
    /** QML: Qt.formatDateTime(new Date(seconds * 1000)) */
    formatTimestamp(seconds: number): string;
    probeWebSockets(): boolean;
    translate(key: PanelTextKey, argument?: unknown): string;
    render(snapshot: ConfigPageSnapshot): void;
}

export interface ConfigPage {
    start(): void;
    fieldsChanged(): void;
    loadLamps(): void;
    testConnection(): void;
    selectLamp(index: number): void;
    snapshot(): ConfigPageSnapshot;
}

const REQUEST_SCOPE = "config";
const REQUEST_TIMEOUT = 8000;

function copyFields(source: ConfigFields): ConfigFields {
    return {
        url: text(source.url),
        token: text(source.token),
        entityId: text(source.entityId),
        localPresets: strings(source.localPresets),
        cachedPresetsJson: text(source.cachedPresetsJson),
        cachedMetaJson: text(source.cachedMetaJson),
    };
}

// Label repeats the entity id in parentheses; unknown entries are dropped.
function toLamps(value: unknown): ConfigLamp[] {
    const result: ConfigLamp[] = [];
    if (!isList(value))
        return result;

    for (let i = 0; i < value.length; ++i) {
        const item = value[i];
        if (!item || typeof item !== "object")
            continue;

        const record = item as { entityId?: unknown; name?: unknown };
        const entityId = text(record.entityId);
        if (entityId.length === 0)
            continue;

        result.push({ label: `${text(record.name) || entityId} (${entityId})`, entityId: entityId });
    }
    return result;
}

function indexOfLamp(lamps: ConfigLamp[], entityId: string): number {
    for (let i = 0; i < lamps.length; ++i) {
        const lamp = lamps[i];
        if (lamp && lamp.entityId === entityId)
            return i;
    }
    return -1;
}

// Settings page state; never touches QML directly, every change ends in render().
export function createConfigPage(host: ConfigPageHost): ConfigPage {
    let started = false;
    let loadingLamps = false;
    let lamps: ConfigLamp[] = [];
    let selectedLampIndex = -1;
    let cacheStatus = "";
    let testText = "";
    let testTone: ConfigTone = "neutral";
    let webSocketsAvailable = true;

    function fields(): ConfigFields {
        return copyFields(host.fields());
    }

    /** Trims url/token; the connection test sends them untrimmed. */
    function requestCfg(current: ConfigFields): { url: string; token: string; scope: string; timeout: number } {
        return {
            url: current.url.trim(),
            token: current.token.trim(),
            scope: REQUEST_SCOPE,
            timeout: REQUEST_TIMEOUT,
        };
    }

    // The cache only counts when its meta belongs to this URL/entity pair.
    function buildCacheStatus(current: ConfigFields): string {
        const source = sourceKey(current.url, current.entityId);
        const metaJson = current.cachedMetaJson || "{}";
        const presetsJson = current.cachedPresetsJson || "[]";

        const meta = decodeMeta(metaJson);
        const presets = decodePresets(presetsJson, meta, source);
        if (!meta || meta.source !== source || !presets) {
            if (isCorruptJson(metaJson) || isCorruptJson(presetsJson))
                console.warn("Could not read cached presets: corrupt cache data");
            return host.translate("cfgCacheNone");
        }

        const date = meta.syncedAt > 0
            ? host.formatTimestamp(meta.syncedAt)
            : host.translate("cfgNever");
        return host.translate("cfgCacheStatus", { count: presets.length, date: date });
    }

    function buildSnapshot(): ConfigPageSnapshot {
        return {
            loadingLamps: loadingLamps,
            lamps: lamps,
            selectedLampIndex: selectedLampIndex,
            cacheStatus: cacheStatus,
            testText: testText,
            testTone: testTone,
            webSocketsAvailable: webSocketsAvailable,
        };
    }

    function render(): void {
        host.render(buildSnapshot());
    }

    function start(): void {
        if (started)
            return;
        started = true;
        webSocketsAvailable = host.probeWebSockets();
        cacheStatus = buildCacheStatus(fields());
        render();
    }

    // Only the cache summary depends on the cfg values.
    function fieldsChanged(): void {
        cacheStatus = buildCacheStatus(fields());
        render();
    }

    function loadLamps(): void {
        const current = fields();
        if (loadingLamps)
            return;

        loadingLamps = true;
        testText = host.translate("cfgLoadingLamps");
        testTone = "neutral";
        render();

        host.fetchLights(requestCfg(current), function (value: unknown): void {
            loadingLamps = false;
            lamps = toLamps(value);
            selectedLampIndex = indexOfLamp(lamps, current.entityId.trim());
            if (lamps.length === 0) {
                testText = host.translate("cfgNoLamps");
                testTone = "neutral";
            } else {
                testText = host.translate("cfgFoundLamps", lamps.length);
                testTone = "positive";
            }
            render();
        }, function (error: unknown): void {
            loadingLamps = false;
            testText = host.translate("cfgError", host.errorText(error));
            testTone = "negative";
            render();
        });
    }

    function testConnection(): void {
        const current = fields();
        testText = host.translate("cfgTesting");
        testTone = "neutral";
        render();

        host.fetchState({
            url: current.url,
            token: current.token,
            entityId: current.entityId,
        }, function (state: unknown): void {
            const reported = state && typeof state === "object"
                ? (state as { state?: unknown }).state
                : undefined;
            if (reported) {
                testText = host.translate(reported === "on" ? "cfgConnectedOn" : "cfgConnectedOff");
                testTone = "positive";
            } else {
                testText = host.translate("cfgInvalidState");
                testTone = "neutral";
            }
            render();
        }, function (error: unknown): void {
            testText = host.translate("cfgError", host.errorText(error));
            testTone = "negative";
            render();
        });
    }

    /** Selects a loaded lamp; writing the cfg field stays in QML. */
    function selectLamp(index: number): void {
        const lamp = lamps[index];
        if (!lamp)
            return;

        selectedLampIndex = index;
        render();
    }

    function snapshot(): ConfigPageSnapshot {
        return buildSnapshot();
    }

    return {
        start: start,
        fieldsChanged: fieldsChanged,
        loadLamps: loadLamps,
        testConnection: testConnection,
        selectLamp: selectLamp,
        snapshot: snapshot,
    };
}
