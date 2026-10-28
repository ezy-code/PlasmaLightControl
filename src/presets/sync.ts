import { computeDefaults } from "../colors/defaults.ts";
import { applyOps, canonicalList, normalize, normalizeList } from "../colors/spec.ts";
import type { LightColor } from "../colors/types.ts";
import { text } from "../shared/coerce.ts";
import { sourceKey } from "../ha/sourceKey.ts";
import type { PanelTextKey } from "../i18n/textKeys.ts";

export interface SyncConfig {
    baseUrl: string;
    token: string;
    entityId: string;
    active: boolean;
}

export interface SyncCache {
    presets: unknown;
    meta: unknown;
    available: boolean;
}

/** The five host timers; every delay is decided here. */
export type SyncTimer = "config" | "pushDebounce" | "pushRetry" | "event" | "defaultsWait";

export interface SyncError {
    code: string;
    message?: string;
}

/** HaSocket.qml, seen through the host. */
export interface SyncTransport {
    isAuthenticated(): boolean;
    request(
        type: string,
        payload: Record<string, unknown> | null,
        onSuccess?: (result: unknown) => void,
        onError?: (error: SyncError) => void,
    ): number;
    subscribe(
        eventType: string,
        onSuccess?: (result: unknown) => void,
        onError?: (error: SyncError) => void,
    ): number;
    connect(): void;
    reset(): void;
    retryNow(): void;
}

// Everything the preset logic cannot own itself; PresetSync.qml implements it.
export interface SyncHost {
    config(): SyncConfig;
    cache(): SyncCache;
    lightAttributes(): unknown;
    lightStateKnown(): boolean;
    transport(): SyncTransport;
    startTimer(name: SyncTimer, delayMs: number): void;
    stopTimer(name: SyncTimer): void;
    /** Wall clock in seconds, with a fractional part. */
    now(): number;
    callLater(callback: () => void): void;
    translate(key: PanelTextKey, argument?: unknown): string;
}

export interface SyncEvents {
    presetsPulled(presets: unknown[], meta: Record<string, unknown>): void;
    presetsPushed(presets: unknown[], meta: Record<string, unknown>): void;
    statusChanged(state: string, message: string): void;
    authFailed(message: string): void;
    writeForbidden(message: string): void;
    permissionChanged(admin: boolean): void;
}

export interface PresetSyncModule {
    start(): void;
    pull(): void;
    queueAdd(spec: unknown): boolean;
    queueRemove(spec: unknown): boolean;
    retryNow(): void;
    inputsChanged(): void;
    lightStateKnownChanged(): void;
    lightAttributesChanged(): void;
    handleTimer(name: SyncTimer): void;
    transportStatus(state: string, message: string): void;
    transportAuthFailed(message: string): void;
    transportAuthenticated(admin: boolean): void;
    transportPermissionChanged(admin: boolean): void;
    transportEvent(eventType: string, data: unknown): void;
    isAdmin(): boolean;
}

/** One queued preset edit; the id confirms exactly this operation. */
interface PendingOp {
    id: number;
    type: "add" | "remove";
    spec: LightColor;
}

type SyncMeta = Record<string, unknown>;

/** Home Assistant protocol key of the entity-registry preset list; never rename. */
const FAVORITE_COLORS_KEY = "favorite_colors";
const CONFIG_DELAY_MS = 50;
const PUSH_DEBOUNCE_MS = 600;
const PUSH_DEBOUNCE_AFTER_UPDATE_MS = 150;
const PUSH_DEBOUNCE_AFTER_PULL_MS = 200;
const PUSH_RETRY_BASE_MS = 1000;
const PUSH_RETRY_MAX_MS = 60000;
const PUSH_RETRY_MAX_STEP = 6;
const EVENT_DEBOUNCE_MS = 300;
const DEFAULTS_WAIT_MS = 10000;

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object")
        return {};
    return value as Record<string, unknown>;
}

/** Number(), with a non-finite value becoming 0. */
function asNumber(value: unknown): number {
    const number = Number(value);
    return isFinite(number) ? number : 0;
}

/** Shallow copy of the entity options; the request must not alias them. */
function copyObject(source: unknown): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!source || typeof source !== "object")
        return result;

    const record = source as Record<string, unknown>;
    for (const key of Object.keys(record))
        result[key] = record[key];
    return result;
}

/** The entity entry of a registry response: either wrapped or bare. */
function entryFromResult(result: unknown): Record<string, unknown> | null {
    if (!result || typeof result !== "object")
        return null;

    const record = result as Record<string, unknown>;
    if (record.entity_entry && typeof record.entity_entry === "object")
        return record.entity_entry as Record<string, unknown>;
    if (typeof record.entity_id === "string")
        return record;
    return null;
}

function makeError(code: string, message: string): SyncError {
    return { code: code, message: message || "" };
}

// Pull/push, pending ops, defaults, cache metadata, status. Never writes config.
export function createPresetSync(host: SyncHost, events: SyncEvents): PresetSyncModule {
    let admin = false;
    let readOnly = false;
    let unsupported = false;
    let pullInFlight = false;
    let pullQueued = false;
    let pushInFlight = false;
    let pushRetryAttempt = 0;
    // The host cannot be asked whether a timer runs, so this mirrors pushRetry.
    let pushRetryRunning = false;
    let nextOpId = 0;
    // Bumped on a config change; requests started for older settings are dropped.
    let configGeneration = 0;
    let pendingOps: PendingOp[] = [];
    let defaultsPending: { modifiedAt: number } | null = null;
    // Set when the lamp state was missing; the next known state retries defaults.
    let defaultsNeeded = false;
    let lastOriginDefaults = false;
    let lastModifiedAt = 0;
    let lastCanonical = "";
    let lastServerCanonical = "";
    let lastOrigin = "";
    let lastState = "off";
    let lastMessage = "";

    function stopTimer(name: SyncTimer): void {
        if (name === "pushRetry")
            pushRetryRunning = false;
        host.stopTimer(name);
    }

    function setState(state: string, message: string): void {
        const value = message || "";
        if (state === lastState && value === lastMessage)
            return;

        lastState = state;
        lastMessage = value;
        events.statusChanged(state, value);
    }

    function makeMeta(origin: string, modifiedAt: unknown): SyncMeta {
        const config = host.config();
        return {
            v: 1,
            source: sourceKey(config.baseUrl, config.entityId),
            origin: origin,
            modifiedAt: asNumber(modifiedAt),
            syncedAt: host.now(),
        };
    }

    function currentDefaults(): LightColor[] {
        return computeDefaults({ attributes: host.lightAttributes() || {} });
    }

    function hasCache(): boolean {
        const cache = host.cache();
        if (cache.available)
            return true;

        const meta = asRecord(cache.meta);
        const config = host.config();
        return meta.v === 1 && meta.source === sourceKey(config.baseUrl, config.entityId);
    }

    function canWrite(): boolean {
        return host.transport().isAuthenticated() && admin && !readOnly && !unsupported;
    }

    // Emits only when the list, origin or server list changed; force always emits.
    function publish(presets: unknown, meta: SyncMeta, force?: boolean): void {
        const list = normalizeList(presets);
        const canonical = canonicalList(list);
        const origin = text(meta.origin);
        const server = Array.isArray(meta.serverPresets) ? meta.serverPresets : null;
        const serverCanonical = server === null ? "" : canonicalList(server);
        const changed = force === true || canonical !== lastCanonical || origin !== lastOrigin
            || (server !== null && serverCanonical !== lastServerCanonical);

        lastCanonical = canonical;
        lastServerCanonical = serverCanonical;
        lastOrigin = origin;
        // Origin "defaults" lets a later attribute update refresh the displayed list.
        lastOriginDefaults = origin === "defaults";

        if (changed)
            events.presetsPulled(list, meta);
    }

    function publishServer(
        serverPresets: unknown,
        origin: string,
        modifiedAt: unknown,
        force?: boolean,
    ): void {
        const server = normalizeList(serverPresets);
        const display = applyOps(server, pendingOps);
        const meta = makeMeta(origin, modifiedAt);
        meta.pending = pendingOps.length > 0;
        meta.serverPresets = server;
        publish(display, meta, force);
    }

    // An empty result is never published: it would overwrite the user's colors.
    function publishDefaults(modifiedAt: unknown, force?: boolean): void {
        lastOriginDefaults = true;
        const defaults = currentDefaults();
        if (defaults.length === 0)
            return;
        publishServer(defaults, "defaults", modifiedAt, force);
    }

    function schedulePush(delay?: number): void {
        host.startTimer("pushDebounce", typeof delay === "number" ? delay : PUSH_DEBOUNCE_MS);
    }

    function applyConfigNow(): void {
        teardown();
        const transport = host.transport();
        transport.reset();
        admin = false;
        events.permissionChanged(false);
        readOnly = false;
        unsupported = false;
        pushRetryAttempt = 0;
        lastCanonical = "";
        lastServerCanonical = "";
        lastOrigin = "";
        lastOriginDefaults = false;
        lastModifiedAt = 0;
        defaultsPending = null;
        pendingOps = [];

        const config = host.config();
        if (!config.active) {
            setState("off", "");
            return;
        }

        if (!config.baseUrl || !config.token || !config.entityId) {
            setState("error", host.translate("presetNotConfigured"));
            return;
        }

        setState("connecting", "");
        transport.connect();
    }

    function teardown(): void {
        stopTimer("config");
        stopTimer("pushDebounce");
        stopTimer("pushRetry");
        stopTimer("event");
        stopTimer("defaultsWait");

        pullInFlight = false;
        pullQueued = false;
        pushInFlight = false;
        pendingOps = [];
        defaultsPending = null;
        defaultsNeeded = false;
    }

    // The transport is still authenticated with the old settings until the debounce
    // elapses, so drop everything that could still reach the previous entity.
    function invalidateConfig(): void {
        ++configGeneration;
        stopTimer("pushDebounce");
        stopTimer("pushRetry");
        stopTimer("event");
        pendingOps = [];
    }

    function scheduleConfigChange(): void {
        host.startTimer("config", CONFIG_DELAY_MS);
    }

    function inputsChanged(): void {
        invalidateConfig();
        scheduleConfigChange();
    }

    function pull(): void {
        const config = host.config();
        if (!config.active)
            return;

        const transport = host.transport();
        if (!transport.isAuthenticated()) {
            setState("connecting", "");
            return;
        }

        if (pushInFlight || pullInFlight) {
            pullQueued = true;
            return;
        }

        if (unsupported)
            return;

        pullInFlight = true;
        const generation = configGeneration;
        setState("syncing", host.translate("presetLoading"));
        transport.request("config/entity_registry/get", { entity_id: config.entityId }, (result) => {
            handlePullSuccess(result, generation);
        }, (error) => {
            handlePullError(error, generation);
        });
    }

    function queueAdd(spec: unknown): boolean {
        if (!canWrite()) {
            events.writeForbidden(host.translate("presetWriteNeedsAdmin"));
            return false;
        }

        const normalized = normalize(spec);
        if (!normalized) {
            setState("error", host.translate("presetCannotSave"));
            return false;
        }

        pendingOps.push({ id: ++nextOpId, type: "add", spec: normalized });
        schedulePush();
        return true;
    }

    function queueRemove(spec: unknown): boolean {
        if (!canWrite()) {
            events.writeForbidden(host.translate("presetWriteNeedsAdmin"));
            return false;
        }

        const normalized = normalize(spec);
        if (!normalized) {
            setState("error", host.translate("presetCannotRemove"));
            return false;
        }

        pendingOps.push({ id: ++nextOpId, type: "remove", spec: normalized });
        schedulePush();
        return true;
    }

    function flushPush(): void {
        stopTimer("pushDebounce");
        startPush();
    }

    function retryNow(): void {
        if (!host.config().active)
            return;

        stopTimer("pushRetry");
        // A previous "unsupported" result must not block the retry.
        unsupported = false;

        const transport = host.transport();
        if (transport.isAuthenticated()) {
            if (pendingOps.length > 0)
                flushPush();
            else
                pull();
            return;
        }

        transport.retryNow();
    }

    function subscribeAndPull(): void {
        host.transport().subscribe("entity_registry_updated", () => pull(), (error) => {
            if (error?.code === "aborted")
                return;
            // Restricted installations may refuse subscriptions; pull anyway.
            pull();
        });
    }

    function onAuthenticated(isAdmin: boolean): void {
        // A fresh handshake may succeed where the previous one failed.
        unsupported = false;
        readOnly = !isAdmin;
        subscribeAndPull();
    }

    function onPermissionChanged(isAdmin: boolean): void {
        admin = isAdmin;
        readOnly = !isAdmin;
        events.permissionChanged(isAdmin);
    }

    function handleEvent(eventType: string, data: unknown): void {
        if (eventType !== "entity_registry_updated")
            return;

        const info = asRecord(data);
        if (info.entity_id !== host.config().entityId)
            return;

        host.startTimer("event", EVENT_DEBOUNCE_MS);
    }

    function handlePullSuccess(result: unknown, generation: number): void {
        if (generation !== configGeneration)
            return;

        pullInFlight = false;
        if (!host.config().active)
            return;

        const entry = entryFromResult(result);
        if (!entry) {
            handlePullError(
                makeError("syncInvalidResponse", host.translate("presetInvalidResponse")),
                generation,
            );
            return;
        }

        const lightOptions = asRecord(asRecord(entry.options).light);
        const hasPresets = Object.prototype.hasOwnProperty.call(lightOptions, FAVORITE_COLORS_KEY);
        const modifiedAt = asNumber(entry.modified_at);
        lastModifiedAt = modifiedAt;

        if (!hasPresets) {
            if (!host.lightStateKnown()) {
                defaultsPending = { modifiedAt: modifiedAt };
                defaultsNeeded = true;
                host.startTimer("defaultsWait", DEFAULTS_WAIT_MS);
                setState("syncing", host.translate("presetWaitingLampState"));
                afterPullFinished();
                return;
            }

            defaultsPending = null;
            defaultsNeeded = false;
            host.stopTimer("defaultsWait");
            publishDefaults(modifiedAt);
            afterPullFinished();
            return;
        }

        defaultsPending = null;
        defaultsNeeded = false;
        host.stopTimer("defaultsWait");
        const raw = lightOptions.favorite_colors;
        if (!Array.isArray(raw)) {
            handlePullError(
                makeError("syncInvalidResponse", host.translate("presetInvalidList")),
                generation,
            );
            return;
        }

        publishServer(raw, raw.length === 0 ? "empty" : "custom", modifiedAt);
        afterPullFinished();
    }

    function afterPullFinished(): void {
        if (defaultsPending !== null)
            return;

        if (pullQueued) {
            pullQueued = false;
            host.callLater(() => pull());
            return;
        }

        if (pushInFlight)
            return;

        if (readOnly || !admin) {
            setState("readonly", "");
            return;
        }

        setState("synced", "");

        if (pendingOps.length > 0)
            schedulePush(PUSH_DEBOUNCE_AFTER_PULL_MS);
    }

    function handlePullError(error: SyncError | null | undefined, generation: number): void {
        if (generation !== configGeneration)
            return;

        pullInFlight = false;
        if (!host.config().active || !error || error.code === "aborted")
            return;

        switch (error.code) {
        case "not_found":
        case "unknown_command":
            unsupported = true;
            setState("unsupported", host.translate("presetNotInRegistry"));
            return;
        case "unauthorized":
            setState("error", host.translate("presetAccessDenied"));
            return;
        case "timeout":
            setState(hasCache() ? "cached" : "error", host.translate("presetRequestTimeout"));
            return;
        case "syncConnectionLost":
        case "not_connected":
            setState(hasCache() ? "cached" : "error", host.translate("presetConnectionLost"));
            return;
        default:
            setState("error", error.message || host.translate("presetLoadFailed"));
        }
    }

    function startPush(): void {
        if (pushInFlight || pullInFlight || !host.transport().isAuthenticated() || !canWrite())
            return;
        if (pendingOps.length === 0)
            return;

        pushInFlight = true;
        const sent = pendingOps.slice(0);
        const generation = configGeneration;
        const config = host.config();
        const transport = host.transport();
        setState("syncing", host.translate("presetSaving"));

        transport.request("config/entity_registry/get", { entity_id: config.entityId }, (result) => {
            if (!pushInFlight || generation !== configGeneration)
                return;

            const entry = entryFromResult(result);
            if (!entry) {
                handlePushError(
                    makeError("syncInvalidResponse", host.translate("presetInvalidResponse")),
                    null,
                    generation,
                );
                return;
            }

            const lightOptions = asRecord(asRecord(entry.options).light);
            const raw = lightOptions.favorite_colors;
            const base = Array.isArray(raw) ? normalizeList(raw) : currentDefaults();
            const updated = applyOps(base, sent);

            const nextLightOptions = copyObject(lightOptions);
            nextLightOptions.favorite_colors = updated;

            transport.request("config/entity_registry/update", {
                entity_id: config.entityId,
                options_domain: "light",
                options: nextLightOptions,
            }, (updateResult) => {
                handlePushSuccess(updateResult, sent, generation);
            }, (error) => {
                handlePushError(error, entry, generation);
            });
        }, (error) => {
            handlePushError(error, null, generation);
        });
    }

    function handlePushSuccess(result: unknown, sent: PendingOp[], generation: number): void {
        if (generation !== configGeneration)
            return;

        pushInFlight = false;
        if (!host.config().active)
            return;

        const entry = entryFromResult(result);
        if (!entry) {
            handlePushError(
                makeError("syncInvalidResponse", host.translate("presetInvalidResponse")),
                null,
                generation,
            );
            return;
        }

        const lightOptions = asRecord(asRecord(entry.options).light);
        const serverPresets: unknown[] = Array.isArray(lightOptions.favorite_colors)
            ? normalizeList(lightOptions.favorite_colors) : [];

        // Confirm only the ops of this update; newer ops stay pending.
        const sentIds: Record<number, boolean> = {};
        for (const operation of sent)
            sentIds[operation.id] = true;

        const remaining = pendingOps.filter((operation) => !sentIds[operation.id]);
        pendingOps = remaining;

        const display = applyOps(serverPresets, remaining);
        const origin = serverPresets.length === 0 ? "empty" : "custom";
        const modifiedAt = asNumber(entry.modified_at);
        lastModifiedAt = modifiedAt;
        const meta = makeMeta(origin, modifiedAt);
        meta.pending = remaining.length > 0;
        meta.serverPresets = serverPresets;

        lastCanonical = canonicalList(display);
        lastServerCanonical = canonicalList(serverPresets);
        lastOrigin = origin;
        // Bypasses publish(), so reset the defaults-origin flag explicitly.
        lastOriginDefaults = false;

        pushRetryAttempt = 0;
        events.presetsPushed(display, meta);

        if (remaining.length > 0) {
            schedulePush(PUSH_DEBOUNCE_AFTER_UPDATE_MS);
            setState("syncing", host.translate("presetSaving"));
        } else if (readOnly || !admin) {
            setState("readonly", "");
        } else {
            setState("synced", "");
        }

        if (pullQueued) {
            pullQueued = false;
            host.callLater(() => pull());
        }
    }

    function handlePushError(
        error: SyncError | null | undefined,
        baseEntry: Record<string, unknown> | null,
        generation: number,
    ): void {
        if (generation !== configGeneration)
            return;

        pushInFlight = false;
        if (!host.config().active || !error || error.code === "aborted")
            return;

        switch (error.code) {
        case "unauthorized":
        case "forbidden": {
            readOnly = true;
            admin = false;
            pendingOps = [];
            events.permissionChanged(false);
            setState("readonly", host.translate("presetWriteNeedsAdmin"));
            events.writeForbidden(host.translate("presetWriteNeedsAdmin"));
            return;
        }
        case "not_found":
        case "unknown_command":
            unsupported = true;
            pendingOps = [];
            setState("unsupported", host.translate("presetNotInRegistry"));
            return;
        case "invalid_format":
        case "invalid_info":
            pendingOps = [];
            if (baseEntry) {
                const lightOptions = asRecord(asRecord(baseEntry.options).light);
                const hasPresets = Object.prototype.hasOwnProperty.call(
                    lightOptions,
                    FAVORITE_COLORS_KEY,
                ) && Array.isArray(lightOptions.favorite_colors);
                if (hasPresets) {
                    // The server owns a real list, so defaults are no longer the origin.
                    const list = normalizeList(lightOptions.favorite_colors);
                    const meta = makeMeta(list.length === 0 ? "empty" : "custom",
                        baseEntry.modified_at);
                    meta.pending = false;
                    meta.serverPresets = list;
                    publish(list, meta, true);
                } else {
                    // Computed defaults, not server state: keep the flag, publish nothing.
                    lastOriginDefaults = true;
                    const defaults = currentDefaults();
                    if (defaults.length > 0) {
                        const meta = makeMeta("defaults", baseEntry.modified_at);
                        meta.pending = false;
                        meta.serverPresets = defaults;
                        publish(defaults, meta, true);
                    }
                }
            }
            setState("error", error.message || host.translate("presetRejected"));
            return;
        default:
            setState("error", error.message || host.translate("presetSaveFailed"));
            schedulePushRetry();
        }
    }

    function schedulePushRetry(): void {
        if (!host.config().active || pendingOps.length === 0 || pushRetryRunning)
            return;

        const step = Math.min(pushRetryAttempt, PUSH_RETRY_MAX_STEP);
        const delay = Math.min(PUSH_RETRY_MAX_MS, PUSH_RETRY_BASE_MS * Math.pow(2, step));
        ++pushRetryAttempt;
        pushRetryRunning = true;
        host.startTimer("pushRetry", delay);
    }

    function resolveDefaults(): void {
        if (!host.lightStateKnown() || defaultsPending === null)
            return;

        const pending = defaultsPending;
        defaultsPending = null;
        defaultsNeeded = false;
        host.stopTimer("defaultsWait");
        publishDefaults(pending.modifiedAt, true);
        afterPullFinished();
    }

    // The wait ended without a state: unblock pull/push, report it, keep retrying.
    function handleDefaultsTimeout(): void {
        if (defaultsPending === null)
            return;

        defaultsPending = null;
        defaultsNeeded = true;
        setState("error", host.translate("presetLampStateUnavailable"));

        if (pullQueued) {
            pullQueued = false;
            host.callLater(() => pull());
        }
    }

    // Resolve defaults from the known state directly instead of pulling again.
    function retryDefaults(): void {
        if (!defaultsNeeded || !host.lightStateKnown() || pullInFlight || defaultsPending !== null)
            return;
        defaultsNeeded = false;
        publishDefaults(lastModifiedAt, true);
        afterPullFinished();
    }

    // Recomputes defaults only: the sync state belongs to the pull/push paths.
    function refreshDefaults(): void {
        if (!host.lightStateKnown() || !lastOriginDefaults)
            return;
        if (pendingOps.length > 0 || pushInFlight || pullInFlight || defaultsPending !== null)
            return;

        publishDefaults(lastModifiedAt);
    }

    function lightStateKnownChanged(): void {
        resolveDefaults();
        retryDefaults();
        refreshDefaults();
    }

    function lightAttributesChanged(): void {
        resolveDefaults();
        refreshDefaults();
    }

    function handleTimer(name: SyncTimer): void {
        switch (name) {
        case "config":
            applyConfigNow();
            return;
        case "pushDebounce":
            startPush();
            return;
        case "pushRetry":
            pushRetryRunning = false;
            startPush();
            return;
        case "event":
            pull();
            return;
        case "defaultsWait":
            handleDefaultsTimeout();
        }
    }

    function transportStatus(state: string, message: string): void {
        if (state === "lost")
            setState(hasCache() ? "cached" : "error", message);
        else
            setState(state, message);
    }

    function transportAuthFailed(message: string): void {
        events.authFailed(message);
    }

    function transportAuthenticated(isAdmin: boolean): void {
        onAuthenticated(isAdmin);
    }

    function transportPermissionChanged(isAdmin: boolean): void {
        onPermissionChanged(isAdmin);
    }

    function transportEvent(eventType: string, data: unknown): void {
        handleEvent(eventType, data);
    }

    function isAdmin(): boolean {
        return admin;
    }

    function start(): void {
        scheduleConfigChange();
    }

    return {
        start,
        pull,
        queueAdd,
        queueRemove,
        retryNow,
        inputsChanged,
        lightStateKnownChanged,
        lightAttributesChanged,
        handleTimer,
        transportStatus,
        transportAuthFailed,
        transportAuthenticated,
        transportPermissionChanged,
        transportEvent,
        isAdmin,
    };
}
