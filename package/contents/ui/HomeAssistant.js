.pragma library

// Home Assistant REST API wrapper. cfg: { url, token, entityId, timeout, scope }
// One request per key at a time; a new request supersedes the previous one.

const active = {};    // key -> running request
const versions = {};  // key -> last issued generation
let scopeCounter = 0;

// Keeps the request registry separate per widget instance.
function createScope() {
    return "scope-" + (++scopeCounter);
}

function normalizedBase(url) {
    if (!url)
        return "";
    return url.replace(/\/+$/, "");
}

function requestKey(scope, method, path) {
    return (scope || "") + "|" + method + " " + path;
}

// Polls must finish before the next tick, actions may take longer.
function requestTimeout(cfg, method) {
    const configured = cfg && cfg.timeout;
    const limit = (typeof configured === "number" && configured > 0) ? configured : 8000;
    return method === "GET" ? limit : Math.max(limit, 10000);
}

function makeError(code, details) {
    const err = { code: code };
    if (details) {
        for (const key in details) {
            if (Object.prototype.hasOwnProperty.call(details, key))
                err[key] = details[key];
        }
    }
    return err;
}

// Aborts without firing callbacks.
function discard(entry) {
    entry.cancelled = true;
    if (active[entry.key] === entry)
        delete active[entry.key];
    if (!entry.xhr)
        return;
    try {
        entry.xhr.abort();
    } catch (e) {
        // Already finished.
    }
}

// Aborts running requests of one scope and method.
function cancelRequests(scope, method) {
    const prefix = requestKey(scope, method || "", "");
    const keys = [];
    for (const key in active) {
        if (Object.prototype.hasOwnProperty.call(active, key) && key.indexOf(prefix) === 0)
            keys.push(key);
    }
    for (let i = 0; i < keys.length; ++i)
        discard(active[keys[i]]);
}

function request(cfg, method, path, body, onSuccess, onError) {
    const base = normalizedBase(cfg.url);
    if (!base || !cfg.token) {
        if (onError)
            onError(makeError("notConfigured"));
        return;
    }

    const key = requestKey(cfg.scope, method, path);
    if (active[key])
        discard(active[key]);

    const generation = (versions[key] || 0) + 1;
    versions[key] = generation;

    const entry = {
        key: key,
        generation: generation,
        cancelled: false,
        settled: false,
        xhr: null
    };
    active[key] = entry;

    const xhr = new XMLHttpRequest();
    entry.xhr = xhr;
    xhr.open(method, base + path);
    xhr.setRequestHeader("Authorization", "Bearer " + cfg.token);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = requestTimeout(cfg, method);

    function isCurrent() {
        return !entry.cancelled && !entry.settled
            && versions[key] === entry.generation
            && active[key] === entry;
    }

    function release() {
        if (active[key] === entry)
            delete active[key];
    }

    function finishOk(data) {
        if (!isCurrent())
            return;
        entry.settled = true;
        release();
        if (onSuccess)
            onSuccess(data);
    }

    function finishError(err) {
        if (!isCurrent())
            return;
        entry.settled = true;
        release();
        if (onError)
            onError(err);
    }

    xhr.onreadystatechange = function () {
        if (xhr.readyState !== XMLHttpRequest.DONE)
            return;

        if (xhr.status >= 200 && xhr.status < 300) {
            let data = null;
            if (xhr.responseText) {
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (e) {
                    data = xhr.responseText;
                }
            }
            finishOk(data);
        } else if (xhr.status === 0) {
            // No HTTP exchange: unreachable server, DNS or CORS.
            finishError(makeError("noConnection"));
        } else {
            finishError(makeError("httpError", {
                status: xhr.status,
                detail: xhr.statusText || (xhr.responseText || "").slice(0, 200)
            }));
        }
    };
    xhr.onerror = function () {
        finishError(makeError("networkError"));
    };
    xhr.ontimeout = function () {
        finishError(makeError("timeout"));
    };
    xhr.onabort = function () {
        // Own aborts are silent.
        if (!entry.cancelled)
            finishError(makeError("aborted"));
    };

    if (body)
        xhr.send(JSON.stringify(body));
    else
        xhr.send();
}

function fetchState(cfg, onSuccess, onError) {
    if (!cfg.entityId) {
        if (onError)
            onError(makeError("noEntityId"));
        return;
    }
    request(cfg, "GET", "/api/states/" + encodeURIComponent(cfg.entityId), null, onSuccess, onError);
}

function fetchLights(cfg, onSuccess, onError) {
    request(cfg, "GET", "/api/states", null, function (states) {
        const lamps = [];
        if (Array.isArray(states)) {
            for (let i = 0; i < states.length; ++i) {
                const s = states[i];
                if (!s || typeof s.entity_id !== "string" || s.entity_id.indexOf("light.") !== 0)
                    continue;
                const name = s.attributes && s.attributes.friendly_name;
                lamps.push({ entityId: s.entity_id, name: name || s.entity_id });
            }
        }
        lamps.sort(function (a, b) { return a.name.localeCompare(b.name); });
        if (onSuccess)
            onSuccess(lamps);
    }, onError);
}

function turnOn(cfg, attrs, onSuccess, onError) {
    const body = { entity_id: cfg.entityId };
    if (attrs) {
        for (const key in attrs) {
            if (attrs[key] !== undefined && attrs[key] !== null)
                body[key] = attrs[key];
        }
    }
    request(cfg, "POST", "/api/services/light/turn_on", body, onSuccess, onError);
}

function turnOff(cfg, onSuccess, onError) {
    request(cfg, "POST", "/api/services/light/turn_off", { entity_id: cfg.entityId }, onSuccess, onError);
}

function toggle(cfg, onSuccess, onError) {
    request(cfg, "POST", "/api/services/light/toggle", { entity_id: cfg.entityId }, onSuccess, onError);
}
