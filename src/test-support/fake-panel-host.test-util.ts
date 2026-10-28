import type { HaError, LightServiceAttrs } from "../ha/types.ts";
import type {
    PanelConfig,
    HaConnection,
    PanelHost,
    PanelTextKey,
    PanelSnapshot,
    SyncModule,
} from "../panel/session.ts";

export interface RecordedRequest {
    kind: "fetchState" | "turnOn" | "toggle";
    cfg: HaConnection;
    attributes?: LightServiceAttrs;
    succeed(data?: unknown): void;
    fail(error?: HaError): void;
}

export interface FakeHostWrites {
    localPresets: string[][];
    cachedPresetsJson: string[];
    cachedMetaJson: string[];
}

/** Everything a test wants to assert on: callbacks captured instead of sent. */
export interface FakeHostLog {
    views: PanelSnapshot[];
    requests: RecordedRequest[];
    cancels: Array<{ scope: string; method?: string }>;
    writes: FakeHostWrites;
    later: Array<() => void>;
    refreshTimerRestarts: number;
    colorTimerStarts: number[];
    colorTimerStops: number;
    reloads: number;
}

export interface FakePanelHost {
    host: PanelHost;
    config: PanelConfig;
    log: FakeHostLog;
    clock: number;
    syncModule: SyncModule | null;
    latest(): PanelSnapshot;
    flushLater(): void;
}

export interface FakeSyncModule extends SyncModule {
    added: unknown[];
    removed: unknown[];
    retries: number;
    /** What queueAdd/queueRemove answer; false simulates a rejected operation. */
    accept: boolean;
}

export function createFakeSyncModule(): FakeSyncModule {
    const item: FakeSyncModule = {
        added: [],
        removed: [],
        retries: 0,
        accept: true,
        queueAdd: (spec: unknown): boolean => {
            item.added.push(spec);
            return item.accept;
        },
        queueRemove: (spec: unknown): boolean => {
            item.removed.push(spec);
            return item.accept;
        },
        retryNow: (): void => {
            item.retries += 1;
        },
    };
    return item;
}

export function createFakeHost(overrides: Partial<PanelConfig> = {}): FakePanelHost {
    const config: PanelConfig = {
        url: "http://ha.test:8123",
        token: "token",
        entityId: "light.lamp",
        pollInterval: 15,
        syncPresets: false,
        localPresets: [],
        cachedPresetsJson: "",
        cachedMetaJson: "",
        ...overrides,
    };

    const log: FakeHostLog = {
        views: [],
        requests: [],
        cancels: [],
        writes: { localPresets: [], cachedPresetsJson: [], cachedMetaJson: [] },
        later: [],
        refreshTimerRestarts: 0,
        colorTimerStarts: [],
        colorTimerStops: 0,
        reloads: 0,
    };

    const fake: FakePanelHost = {
        host: undefined as unknown as PanelHost,
        config: config,
        log: log,
        clock: 1_700_000_000,
        syncModule: null,
        latest: (): PanelSnapshot => {
            const view = log.views[log.views.length - 1];
            if (!view)
                throw new Error("the session rendered nothing yet");
            return view;
        },
        flushLater: (): void => {
            const queued = log.later.splice(0, log.later.length);
            for (const callback of queued)
                callback();
        },
    };

    function recordError(error: HaError | undefined): HaError {
        return error || { code: "networkError" };
    }

    fake.host = {
        config: (): PanelConfig => ({ ...config, localPresets: config.localPresets.slice() }),
        setLocalPresets: (value: string[]): void => {
            config.localPresets = value.slice();
            log.writes.localPresets.push(value.slice());
        },
        setCachedPresetsJson: (value: string): void => {
            config.cachedPresetsJson = value;
            log.writes.cachedPresetsJson.push(value);
        },
        setCachedMetaJson: (value: string): void => {
            config.cachedMetaJson = value;
            log.writes.cachedMetaJson.push(value);
        },
        createRequestScope: (): string => "scope-test",
        fetchState: (cfg: HaConnection, onSuccess, onError): void => {
            log.requests.push({
                kind: "fetchState",
                cfg: cfg,
                succeed: (data?: unknown): void => onSuccess(data),
                fail: (error?: HaError): void => onError(recordError(error)),
            });
        },
        turnOn: (cfg: HaConnection, attributes: LightServiceAttrs, onSuccess, onError): void => {
            log.requests.push({
                kind: "turnOn",
                cfg: cfg,
                attributes: attributes,
                succeed: (): void => {
                    if (onSuccess)
                        onSuccess();
                },
                fail: (error?: HaError): void => {
                    if (onError)
                        onError(recordError(error));
                },
            });
        },
        toggle: (cfg: HaConnection, onSuccess, onError): void => {
            log.requests.push({
                kind: "toggle",
                cfg: cfg,
                succeed: (): void => {
                    if (onSuccess)
                        onSuccess();
                },
                fail: (error?: HaError): void => {
                    if (onError)
                        onError(recordError(error));
                },
            });
        },
        cancelRequests: (scope: string, method?: string): void => {
            log.cancels.push(method === undefined ? { scope: scope } : { scope: scope, method: method });
        },
        errorText: (error: unknown): string => {
            if (!error || typeof error !== "object")
                return "unknown";
            const source = error as { code?: unknown; detail?: unknown };
            const code = String(source.code || "unknown");
            return source.detail === undefined ? code : `${code}:${String(source.detail)}`;
        },
        translate: (key: PanelTextKey, argument?: unknown): string => {
            return argument === undefined ? key : `${key}(${String(argument)})`;
        },
        render: (view: PanelSnapshot): void => {
            log.views.push(view);
        },
        callLater: (callback: () => void): void => {
            log.later.push(callback);
        },
        restartRefreshTimer: (): void => {
            log.refreshTimerRestarts += 1;
        },
        startColorTimer: (delayMs: number): void => {
            log.colorTimerStarts.push(delayMs);
        },
        stopColorTimer: (): void => {
            log.colorTimerStops += 1;
        },
        now: (): number => fake.clock,
        syncModule: (): SyncModule | null => fake.syncModule,
        reloadSync: (): void => {
            log.reloads += 1;
        },
    };

    return fake;
}
