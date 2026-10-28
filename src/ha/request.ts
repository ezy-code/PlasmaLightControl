import type { HaConfig, HaError, HaFailureHandler, HaSuccessHandler, HttpMethod } from "./types.ts";

// One request per (scope, method, path); a new one supersedes the previous one.

interface ActiveRequest {
    key: string;
    scope: string;
    method: HttpMethod;
    /** Set before an intentional abort, so onabort stays silent. */
    cancelled: boolean;
    xhr: XMLHttpRequest | null;
}

const active: Record<string, ActiveRequest> = {};
let scopeCounter = 0;

/** Default poll budget; actions get at least MIN_ACTION_TIMEOUT_MS. */
const DEFAULT_POLL_TIMEOUT_MS = 8000;
const MIN_ACTION_TIMEOUT_MS = 10000;

export function createRequestScope(): string {
    return `scope-${++scopeCounter}`;
}

function normalizedBase(url: string | undefined): string {
    if (!url)
        return "";
    return url.replace(/\/+$/, "");
}

function requestKey(scope: string | undefined, method: string, path: string): string {
    return `${scope || ""}|${method} ${path}`;
}

function requestTimeout(cfg: HaConfig, method: HttpMethod): number {
    const configured = cfg.timeout;
    const limit = typeof configured === "number" && configured > 0 ? configured : DEFAULT_POLL_TIMEOUT_MS;
    return method === "GET" ? limit : Math.max(limit, MIN_ACTION_TIMEOUT_MS);
}

function httpError(xhr: XMLHttpRequest): HaError {
    return {
        code: "httpError",
        status: xhr.status,
        detail: xhr.statusText || (xhr.responseText || "").slice(0, 200),
    };
}

function parseBody(responseText: string): unknown {
    if (!responseText)
        return null;
    try {
        return JSON.parse(responseText);
    } catch {
        return responseText;
    }
}

function parseResponse(xhr: XMLHttpRequest): { ok: true; data: unknown } | { ok: false; error: HaError } {
    if (xhr.status >= 200 && xhr.status < 300)
        return { ok: true, data: parseBody(xhr.responseText) };
    if (xhr.status === 0)
        return { ok: false, error: { code: "noConnection" } };
    return { ok: false, error: httpError(xhr) };
}

function isCurrent(entry: ActiveRequest): boolean {
    return !entry.cancelled && active[entry.key] === entry;
}

function release(entry: ActiveRequest): void {
    if (active[entry.key] === entry)
        delete active[entry.key];
}

function settleOk(entry: ActiveRequest, data: unknown, onSuccess?: HaSuccessHandler): void {
    if (!isCurrent(entry))
        return;
    release(entry);
    if (onSuccess)
        onSuccess(data);
}

function settleError(entry: ActiveRequest, error: HaError, onError?: HaFailureHandler): void {
    if (!isCurrent(entry))
        return;
    release(entry);
    if (onError)
        onError(error);
}

function discard(entry: ActiveRequest): void {
    entry.cancelled = true;
    release(entry);
    if (!entry.xhr)
        return;
    try {
        entry.xhr.abort();
    } catch {
        // Already finished.
    }
}

export function cancelRequests(scope: string | undefined, method?: string): void {
    const wantedScope = scope || "";
    for (const key of Object.keys(active)) {
        const entry = active[key];
        if (!entry || entry.scope !== wantedScope || (method && entry.method !== method))
            continue;
        discard(entry);
    }
}

function wireHandlers(
    xhr: XMLHttpRequest,
    entry: ActiveRequest,
    onSuccess?: HaSuccessHandler,
    onError?: HaFailureHandler,
): void {
    xhr.onreadystatechange = function (): void {
        if (xhr.readyState !== XMLHttpRequest.DONE)
            return;
        const response = parseResponse(xhr);
        if (response.ok)
            settleOk(entry, response.data, onSuccess);
        else
            settleError(entry, response.error, onError);
    };
    xhr.onerror = function (): void {
        settleError(entry, { code: "networkError" }, onError);
    };
    xhr.ontimeout = function (): void {
        settleError(entry, { code: "timeout" }, onError);
    };
    xhr.onabort = function (): void {
        if (!entry.cancelled)
            settleError(entry, { code: "aborted" }, onError);
    };
}

export function request(
    cfg: HaConfig,
    method: HttpMethod,
    path: string,
    body: unknown,
    onSuccess?: HaSuccessHandler,
    onError?: HaFailureHandler,
): void {
    const base = normalizedBase(cfg.url);
    if (!base || !cfg.token) {
        if (onError)
            onError({ code: "notConfigured" });
        return;
    }

    const key = requestKey(cfg.scope, method, path);
    const previous = active[key];
    if (previous)
        discard(previous);

    const xhr = new XMLHttpRequest();
    const entry: ActiveRequest = {
        key,
        scope: cfg.scope || "",
        method,
        cancelled: false,
        xhr,
    };
    active[key] = entry;

    xhr.open(method, base + path);
    xhr.setRequestHeader("Authorization", `Bearer ${cfg.token}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = requestTimeout(cfg, method);

    wireHandlers(xhr, entry, onSuccess, onError);

    if (body)
        xhr.send(JSON.stringify(body));
    else
        xhr.send();
}
