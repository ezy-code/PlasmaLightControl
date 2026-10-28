// src/colors/convert.ts
var DEFAULT_MIN_KELVIN = 2700;
var DEFAULT_MAX_KELVIN = 6500;
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isList(value) {
  return value !== null && value !== void 0 && typeof value === "object" && typeof value.length === "number";
}
function toList(value) {
  if (!isList(value))
    return null;
  const result = [];
  for (let i = 0; i < value.length; ++i)
    result.push(value[i]);
  return result;
}
function roundedInt(value, minimum, maximum) {
  return Math.round(clamp(value, minimum, maximum));
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function roundHs(hue, saturation) {
  return [round2(clamp(hue, 0, 360)), round2(clamp(saturation, 0, 100))];
}
function temperatureRed(temperature) {
  if (temperature <= 66)
    return 255;
  return clamp(329.698727446 * Math.pow(temperature - 60, -0.1332047592), 0, 255);
}
function temperatureGreen(temperature) {
  if (temperature <= 66)
    return clamp(99.4708025861 * Math.log(temperature) - 161.1195681661, 0, 255);
  return clamp(288.1221695283 * Math.pow(temperature - 60, -0.0755148492), 0, 255);
}
function temperatureBlue(temperature) {
  if (temperature >= 66)
    return 255;
  if (temperature <= 19)
    return 0;
  return clamp(138.5177312231 * Math.log(temperature - 10) - 305.0447927307, 0, 255);
}
function temperature2rgb(kelvin) {
  const value = kelvin / 100;
  return [
    Math.round(temperatureRed(value)),
    Math.round(temperatureGreen(value)),
    Math.round(temperatureBlue(value))
  ];
}

// src/colors/defaults.ts
var COLOR_TEMP_COUNT = 4;
var DEFAULT_COLORED_COLORS = [
  { rgb_color: [127, 172, 255] },
  // #7FACFF
  { rgb_color: [215, 150, 255] },
  // #D796FF
  { rgb_color: [255, 158, 243] },
  // #FF9EF3
  { rgb_color: [255, 110, 84] }
  // #FF6E54
];
var COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
var APPROX_MIN_KELVIN = 2e3;
var APPROX_MAX_KELVIN = 6500;
function spreadKelvin(minimum, maximum, count) {
  const step = (maximum - minimum) / (count - 1);
  const values = [];
  for (let i = 0; i < count; ++i)
    values.push(Math.round(minimum + step * i));
  return values;
}
function attributesOf(state) {
  if (!state || typeof state !== "object")
    return {};
  const source = state;
  return source.attributes || state;
}
function cloneRgb(spec) {
  const [red, green, blue] = spec.rgb_color;
  return { rgb_color: [red, green, blue] };
}
function hasAnyColorMode(modes) {
  return COLOR_MODES.some((mode) => modes.indexOf(mode) >= 0);
}
function defaultColors(modes, attributes) {
  const colors = [];
  const colored = hasAnyColorMode(modes);
  if (modes.indexOf("color_temp") >= 0) {
    const minimum = isFiniteNumber(attributes.min_color_temp_kelvin) ? attributes.min_color_temp_kelvin : DEFAULT_MIN_KELVIN;
    const maximum = isFiniteNumber(attributes.max_color_temp_kelvin) ? attributes.max_color_temp_kelvin : DEFAULT_MAX_KELVIN;
    for (const kelvin of spreadKelvin(minimum, maximum, COLOR_TEMP_COUNT))
      colors.push({ color_temp_kelvin: kelvin });
  } else if (colored) {
    for (const kelvin of spreadKelvin(APPROX_MIN_KELVIN, APPROX_MAX_KELVIN, COLOR_TEMP_COUNT))
      colors.push({ rgb_color: temperature2rgb(kelvin) });
  }
  if (colored) {
    for (const spec of DEFAULT_COLORED_COLORS)
      colors.push(cloneRgb(spec));
  }
  return colors;
}
function computeDefaults(state) {
  const attributes = attributesOf(state);
  const modes = toList(attributes.supported_color_modes) || [];
  return defaultColors(modes, attributes);
}

// src/colors/spec.ts
function classifyColor(spec) {
  if ("color_temp_kelvin" in spec)
    return { kind: "color_temp_kelvin", value: spec.color_temp_kelvin };
  if ("hs_color" in spec)
    return { kind: "hs_color", value: spec.hs_color };
  if ("rgb_color" in spec)
    return { kind: "rgb_color", value: spec.rgb_color };
  if ("rgbw_color" in spec)
    return { kind: "rgbw_color", value: spec.rgbw_color };
  return { kind: "rgbww_color", value: spec.rgbww_color };
}
function readChannels(value, size) {
  const source = toList(value);
  if ((source == null ? void 0 : source.length) !== size)
    return null;
  const channels = [];
  for (const channel of source) {
    const value2 = Number(channel);
    if (!isFiniteNumber(value2))
      return null;
    channels.push(roundedInt(value2, 0, 255));
  }
  return channels;
}
function normalize(spec) {
  if (!spec || typeof spec !== "object" || isList(spec))
    return null;
  const record = spec;
  if (Object.prototype.hasOwnProperty.call(record, "color_temp_kelvin")) {
    if (record.color_temp_kelvin === null || record.color_temp_kelvin === void 0)
      return null;
    const value = Number(record.color_temp_kelvin);
    if (!isFiniteNumber(value) || value <= 0)
      return null;
    return { color_temp_kelvin: Math.round(value) };
  }
  if (record.hs_color !== void 0) {
    const values = toList(record.hs_color);
    if ((values == null ? void 0 : values.length) !== 2)
      return null;
    const hue = Number(values[0]);
    const saturation = Number(values[1]);
    if (!isFiniteNumber(hue) || !isFiniteNumber(saturation))
      return null;
    return { hs_color: roundHs(hue, saturation) };
  }
  if (record.rgb_color !== void 0) {
    const values = readChannels(record.rgb_color, 3);
    return values ? { rgb_color: values } : null;
  }
  if (record.rgbw_color !== void 0) {
    const values = readChannels(record.rgbw_color, 4);
    return values ? { rgbw_color: values } : null;
  }
  if (record.rgbww_color !== void 0) {
    const values = readChannels(record.rgbww_color, 5);
    return values ? { rgbww_color: values } : null;
  }
  return null;
}
function normalizeList(list) {
  const source = toList(list);
  const result = [];
  if (!source)
    return result;
  for (let i = 0; i < source.length; ++i) {
    const spec = normalize(source[i]);
    if (spec)
      result.push(spec);
    else
      console.warn(`Presets: ignoring invalid preset at index ${i}`);
  }
  return result;
}
function canonicalHs(hs) {
  const hue = Math.round((Number(hs[0]) % 360 + 360) % 360) % 360;
  const saturation = Math.round(clamp(Number(hs[1]), 0, 100));
  return `${hue},${saturation}`;
}
function canonical(spec) {
  const normalized = normalize(spec);
  if (!normalized)
    return "";
  const color = classifyColor(normalized);
  switch (color.kind) {
    case "color_temp_kelvin":
      return `ct:${color.value}`;
    case "hs_color":
      return `hs:${canonicalHs(color.value)}`;
    case "rgb_color":
      return `rgb:${color.value.join(",")}`;
    case "rgbw_color":
      return `rgbw:${color.value.join(",")}`;
    case "rgbww_color":
      return `rgbww:${color.value.join(",")}`;
  }
}
function indexOfCanonical(list, spec) {
  const key = canonical(spec);
  if (!key)
    return -1;
  for (let i = 0; i < list.length; ++i) {
    if (canonical(list[i]) === key)
      return i;
  }
  return -1;
}
function canonicalList(list) {
  const source = toList(list);
  const result = [];
  if (!source)
    return "";
  for (let i = 0; i < source.length; ++i) {
    const key = canonical(source[i]);
    if (key)
      result.push(key);
  }
  return result.join("|");
}
function toColorOp(value) {
  if (!value || typeof value !== "object")
    return null;
  const raw = value;
  if (raw.type !== "add" && raw.type !== "remove")
    return null;
  const spec = normalize(raw.spec);
  return spec ? { type: raw.type, spec } : null;
}
function applyOps(list, ops) {
  const result = normalizeList(list);
  const source = toList(ops);
  if (!source)
    return result;
  for (const item of source) {
    const operation = toColorOp(item);
    if (!operation)
      continue;
    if (operation.type === "add") {
      if (indexOfCanonical(result, operation.spec) < 0)
        result.push(operation.spec);
    } else {
      const index = indexOfCanonical(result, operation.spec);
      if (index >= 0)
        result.splice(index, 1);
    }
  }
  return result;
}

// src/shared/coerce.ts
function text(value) {
  return String(value || "");
}

// src/ha/sourceKey.ts
function sourceKey(baseUrl, entityId) {
  return `${text(baseUrl).trim().replace(/\/+$/, "")}|${text(entityId).trim()}`;
}

// src/presets/sync.ts
var FAVORITE_COLORS_KEY = "favorite_colors";
var CONFIG_DELAY_MS = 50;
var PUSH_DEBOUNCE_MS = 600;
var PUSH_DEBOUNCE_AFTER_UPDATE_MS = 150;
var PUSH_DEBOUNCE_AFTER_PULL_MS = 200;
var PUSH_RETRY_BASE_MS = 1e3;
var PUSH_RETRY_MAX_MS = 6e4;
var PUSH_RETRY_MAX_STEP = 6;
var EVENT_DEBOUNCE_MS = 300;
var DEFAULTS_WAIT_MS = 1e4;
function asRecord(value) {
  if (!value || typeof value !== "object")
    return {};
  return value;
}
function asNumber(value) {
  const number = Number(value);
  return isFinite(number) ? number : 0;
}
function copyObject(source) {
  const result = {};
  if (!source || typeof source !== "object")
    return result;
  const record = source;
  for (const key of Object.keys(record))
    result[key] = record[key];
  return result;
}
function entryFromResult(result) {
  if (!result || typeof result !== "object")
    return null;
  const record = result;
  if (record.entity_entry && typeof record.entity_entry === "object")
    return record.entity_entry;
  if (typeof record.entity_id === "string")
    return record;
  return null;
}
function makeError(code, message) {
  return { code, message: message || "" };
}
function createPresetSync(host, events) {
  let admin = false;
  let readOnly = false;
  let unsupported = false;
  let pullInFlight = false;
  let pullQueued = false;
  let pushInFlight = false;
  let pushRetryAttempt = 0;
  let pushRetryRunning = false;
  let nextOpId = 0;
  let configGeneration = 0;
  let pendingOps = [];
  let defaultsPending = null;
  let defaultsNeeded = false;
  let lastOriginDefaults = false;
  let lastModifiedAt = 0;
  let lastCanonical = "";
  let lastServerCanonical = "";
  let lastOrigin = "";
  let lastState = "off";
  let lastMessage = "";
  function stopTimer(name) {
    if (name === "pushRetry")
      pushRetryRunning = false;
    host.stopTimer(name);
  }
  function setState(state, message) {
    const value = message || "";
    if (state === lastState && value === lastMessage)
      return;
    lastState = state;
    lastMessage = value;
    events.statusChanged(state, value);
  }
  function makeMeta(origin, modifiedAt) {
    const config = host.config();
    return {
      v: 1,
      source: sourceKey(config.baseUrl, config.entityId),
      origin,
      modifiedAt: asNumber(modifiedAt),
      syncedAt: host.now()
    };
  }
  function currentDefaults() {
    return computeDefaults({ attributes: host.lightAttributes() || {} });
  }
  function hasCache() {
    const cache = host.cache();
    if (cache.available)
      return true;
    const meta = asRecord(cache.meta);
    const config = host.config();
    return meta.v === 1 && meta.source === sourceKey(config.baseUrl, config.entityId);
  }
  function canWrite() {
    return host.transport().isAuthenticated() && admin && !readOnly && !unsupported;
  }
  function publish(presets, meta, force) {
    const list = normalizeList(presets);
    const canonical2 = canonicalList(list);
    const origin = text(meta.origin);
    const server = Array.isArray(meta.serverPresets) ? meta.serverPresets : null;
    const serverCanonical = server === null ? "" : canonicalList(server);
    const changed = force === true || canonical2 !== lastCanonical || origin !== lastOrigin || server !== null && serverCanonical !== lastServerCanonical;
    lastCanonical = canonical2;
    lastServerCanonical = serverCanonical;
    lastOrigin = origin;
    lastOriginDefaults = origin === "defaults";
    if (changed)
      events.presetsPulled(list, meta);
  }
  function publishServer(serverPresets, origin, modifiedAt, force) {
    const server = normalizeList(serverPresets);
    const display = applyOps(server, pendingOps);
    const meta = makeMeta(origin, modifiedAt);
    meta.pending = pendingOps.length > 0;
    meta.serverPresets = server;
    publish(display, meta, force);
  }
  function publishDefaults(modifiedAt, force) {
    lastOriginDefaults = true;
    const defaults = currentDefaults();
    if (defaults.length === 0)
      return;
    publishServer(defaults, "defaults", modifiedAt, force);
  }
  function schedulePush(delay) {
    host.startTimer("pushDebounce", typeof delay === "number" ? delay : PUSH_DEBOUNCE_MS);
  }
  function applyConfigNow() {
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
  function teardown() {
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
  function invalidateConfig() {
    ++configGeneration;
    stopTimer("pushDebounce");
    stopTimer("pushRetry");
    stopTimer("event");
    pendingOps = [];
  }
  function scheduleConfigChange() {
    host.startTimer("config", CONFIG_DELAY_MS);
  }
  function inputsChanged() {
    invalidateConfig();
    scheduleConfigChange();
  }
  function pull() {
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
  function queueAdd(spec) {
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
  function queueRemove(spec) {
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
  function flushPush() {
    stopTimer("pushDebounce");
    startPush();
  }
  function retryNow() {
    if (!host.config().active)
      return;
    stopTimer("pushRetry");
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
  function subscribeAndPull() {
    host.transport().subscribe("entity_registry_updated", () => pull(), (error) => {
      if ((error == null ? void 0 : error.code) === "aborted")
        return;
      pull();
    });
  }
  function onAuthenticated(isAdmin2) {
    unsupported = false;
    readOnly = !isAdmin2;
    subscribeAndPull();
  }
  function onPermissionChanged(isAdmin2) {
    admin = isAdmin2;
    readOnly = !isAdmin2;
    events.permissionChanged(isAdmin2);
  }
  function handleEvent(eventType, data) {
    if (eventType !== "entity_registry_updated")
      return;
    const info = asRecord(data);
    if (info.entity_id !== host.config().entityId)
      return;
    host.startTimer("event", EVENT_DEBOUNCE_MS);
  }
  function handlePullSuccess(result, generation) {
    if (generation !== configGeneration)
      return;
    pullInFlight = false;
    if (!host.config().active)
      return;
    const entry = entryFromResult(result);
    if (!entry) {
      handlePullError(
        makeError("syncInvalidResponse", host.translate("presetInvalidResponse")),
        generation
      );
      return;
    }
    const lightOptions = asRecord(asRecord(entry.options).light);
    const hasPresets = Object.prototype.hasOwnProperty.call(lightOptions, FAVORITE_COLORS_KEY);
    const modifiedAt = asNumber(entry.modified_at);
    lastModifiedAt = modifiedAt;
    if (!hasPresets) {
      if (!host.lightStateKnown()) {
        defaultsPending = { modifiedAt };
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
        generation
      );
      return;
    }
    publishServer(raw, raw.length === 0 ? "empty" : "custom", modifiedAt);
    afterPullFinished();
  }
  function afterPullFinished() {
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
  function handlePullError(error, generation) {
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
  function startPush() {
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
          generation
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
        options: nextLightOptions
      }, (updateResult) => {
        handlePushSuccess(updateResult, sent, generation);
      }, (error) => {
        handlePushError(error, entry, generation);
      });
    }, (error) => {
      handlePushError(error, null, generation);
    });
  }
  function handlePushSuccess(result, sent, generation) {
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
        generation
      );
      return;
    }
    const lightOptions = asRecord(asRecord(entry.options).light);
    const serverPresets = Array.isArray(lightOptions.favorite_colors) ? normalizeList(lightOptions.favorite_colors) : [];
    const sentIds = {};
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
  function handlePushError(error, baseEntry, generation) {
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
            FAVORITE_COLORS_KEY
          ) && Array.isArray(lightOptions.favorite_colors);
          if (hasPresets) {
            const list = normalizeList(lightOptions.favorite_colors);
            const meta = makeMeta(
              list.length === 0 ? "empty" : "custom",
              baseEntry.modified_at
            );
            meta.pending = false;
            meta.serverPresets = list;
            publish(list, meta, true);
          } else {
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
  function schedulePushRetry() {
    if (!host.config().active || pendingOps.length === 0 || pushRetryRunning)
      return;
    const step = Math.min(pushRetryAttempt, PUSH_RETRY_MAX_STEP);
    const delay = Math.min(PUSH_RETRY_MAX_MS, PUSH_RETRY_BASE_MS * Math.pow(2, step));
    ++pushRetryAttempt;
    pushRetryRunning = true;
    host.startTimer("pushRetry", delay);
  }
  function resolveDefaults() {
    if (!host.lightStateKnown() || defaultsPending === null)
      return;
    const pending = defaultsPending;
    defaultsPending = null;
    defaultsNeeded = false;
    host.stopTimer("defaultsWait");
    publishDefaults(pending.modifiedAt, true);
    afterPullFinished();
  }
  function handleDefaultsTimeout() {
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
  function retryDefaults() {
    if (!defaultsNeeded || !host.lightStateKnown() || pullInFlight || defaultsPending !== null)
      return;
    defaultsNeeded = false;
    publishDefaults(lastModifiedAt, true);
    afterPullFinished();
  }
  function refreshDefaults() {
    if (!host.lightStateKnown() || !lastOriginDefaults)
      return;
    if (pendingOps.length > 0 || pushInFlight || pullInFlight || defaultsPending !== null)
      return;
    publishDefaults(lastModifiedAt);
  }
  function lightStateKnownChanged() {
    resolveDefaults();
    retryDefaults();
    refreshDefaults();
  }
  function lightAttributesChanged() {
    resolveDefaults();
    refreshDefaults();
  }
  function handleTimer(name) {
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
  function transportStatus(state, message) {
    if (state === "lost")
      setState(hasCache() ? "cached" : "error", message);
    else
      setState(state, message);
  }
  function transportAuthFailed(message) {
    events.authFailed(message);
  }
  function transportAuthenticated(isAdmin2) {
    onAuthenticated(isAdmin2);
  }
  function transportPermissionChanged(isAdmin2) {
    onPermissionChanged(isAdmin2);
  }
  function transportEvent(eventType, data) {
    handleEvent(eventType, data);
  }
  function isAdmin() {
    return admin;
  }
  function start() {
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
    isAdmin
  };
}
export {
  createPresetSync
};
