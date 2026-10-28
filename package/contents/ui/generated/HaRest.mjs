// src/ha/request.ts
var active = {};
var scopeCounter = 0;
var DEFAULT_POLL_TIMEOUT_MS = 8e3;
var MIN_ACTION_TIMEOUT_MS = 1e4;
function createRequestScope() {
  return `scope-${++scopeCounter}`;
}
function normalizedBase(url) {
  if (!url)
    return "";
  return url.replace(/\/+$/, "");
}
function requestKey(scope, method, path) {
  return `${scope || ""}|${method} ${path}`;
}
function requestTimeout(cfg, method) {
  const configured = cfg.timeout;
  const limit = typeof configured === "number" && configured > 0 ? configured : DEFAULT_POLL_TIMEOUT_MS;
  return method === "GET" ? limit : Math.max(limit, MIN_ACTION_TIMEOUT_MS);
}
function httpError(xhr) {
  return {
    code: "httpError",
    status: xhr.status,
    detail: xhr.statusText || (xhr.responseText || "").slice(0, 200)
  };
}
function parseBody(responseText) {
  if (!responseText)
    return null;
  try {
    return JSON.parse(responseText);
  } catch (e) {
    return responseText;
  }
}
function parseResponse(xhr) {
  if (xhr.status >= 200 && xhr.status < 300)
    return { ok: true, data: parseBody(xhr.responseText) };
  if (xhr.status === 0)
    return { ok: false, error: { code: "noConnection" } };
  return { ok: false, error: httpError(xhr) };
}
function isCurrent(entry) {
  return !entry.cancelled && active[entry.key] === entry;
}
function release(entry) {
  if (active[entry.key] === entry)
    delete active[entry.key];
}
function settleOk(entry, data, onSuccess) {
  if (!isCurrent(entry))
    return;
  release(entry);
  if (onSuccess)
    onSuccess(data);
}
function settleError(entry, error, onError) {
  if (!isCurrent(entry))
    return;
  release(entry);
  if (onError)
    onError(error);
}
function discard(entry) {
  entry.cancelled = true;
  release(entry);
  if (!entry.xhr)
    return;
  try {
    entry.xhr.abort();
  } catch (e) {
  }
}
function cancelRequests(scope, method) {
  const wantedScope = scope || "";
  for (const key of Object.keys(active)) {
    const entry = active[key];
    if (!entry || entry.scope !== wantedScope || method && entry.method !== method)
      continue;
    discard(entry);
  }
}
function wireHandlers(xhr, entry, onSuccess, onError) {
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== XMLHttpRequest.DONE)
      return;
    const response = parseResponse(xhr);
    if (response.ok)
      settleOk(entry, response.data, onSuccess);
    else
      settleError(entry, response.error, onError);
  };
  xhr.onerror = function() {
    settleError(entry, { code: "networkError" }, onError);
  };
  xhr.ontimeout = function() {
    settleError(entry, { code: "timeout" }, onError);
  };
  xhr.onabort = function() {
    if (!entry.cancelled)
      settleError(entry, { code: "aborted" }, onError);
  };
}
function request(cfg, method, path, body, onSuccess, onError) {
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
  const entry = {
    key,
    scope: cfg.scope || "",
    method,
    cancelled: false,
    xhr
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

// src/ha/rest.ts
function fetchState(cfg, onSuccess, onError) {
  if (!cfg.entityId) {
    if (onError)
      onError({ code: "noEntityId" });
    return;
  }
  request(cfg, "GET", `/api/states/${encodeURIComponent(cfg.entityId)}`, null, onSuccess, onError);
}
function toLampSummary(item) {
  var _a;
  if (!item || typeof item !== "object")
    return null;
  const state = item;
  if (typeof state.entity_id !== "string" || state.entity_id.indexOf("light.") !== 0)
    return null;
  const name = (_a = state.attributes) == null ? void 0 : _a.friendly_name;
  return {
    entityId: state.entity_id,
    name: typeof name === "string" && name ? name : state.entity_id
  };
}
function fetchLights(cfg, onSuccess, onError) {
  request(cfg, "GET", "/api/states", null, function(states) {
    const lamps = [];
    if (Array.isArray(states)) {
      for (const item of states) {
        const lamp = toLampSummary(item);
        if (lamp)
          lamps.push(lamp);
      }
    }
    lamps.sort((first, second) => first.name.localeCompare(second.name));
    if (onSuccess)
      onSuccess(lamps);
  }, onError);
}
function lightService(cfg, service, body, onSuccess, onError) {
  request(cfg, "POST", `/api/services/light/${service}`, body, onSuccess, onError);
}
function turnOn(cfg, attrs, onSuccess, onError) {
  const body = { entity_id: cfg.entityId };
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value !== void 0 && value !== null)
        body[key] = value;
    }
  }
  lightService(cfg, "turn_on", body, onSuccess, onError);
}
function turnOff(cfg, onSuccess, onError) {
  lightService(cfg, "turn_off", { entity_id: cfg.entityId }, onSuccess, onError);
}
function toggle(cfg, onSuccess, onError) {
  lightService(cfg, "toggle", { entity_id: cfg.entityId }, onSuccess, onError);
}
export {
  cancelRequests,
  createRequestScope,
  fetchLights,
  fetchState,
  toggle,
  turnOff,
  turnOn
};
