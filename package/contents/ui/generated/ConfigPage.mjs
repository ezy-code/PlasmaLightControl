// src/colors/convert.ts
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

// src/shared/coerce.ts
function text(value) {
  return String(value || "");
}
function strings(value) {
  if (!isList(value))
    return [];
  const result = [];
  for (let i = 0; i < value.length; ++i)
    result.push(String(value[i]));
  return result;
}

// src/ha/sourceKey.ts
function sourceKey(baseUrl, entityId) {
  return `${text(baseUrl).trim().replace(/\/+$/, "")}|${text(entityId).trim()}`;
}

// src/colors/spec.ts
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

// src/presets/cache.ts
var ALLOWED_ORIGINS = ["custom", "defaults", "empty", "local"];
function isAllowedOrigin(value) {
  return typeof value === "string" && ALLOWED_ORIGINS.indexOf(value) >= 0;
}
function parseJson(text2) {
  if (typeof text2 !== "string")
    return void 0;
  try {
    return JSON.parse(text2);
  } catch (e) {
    return void 0;
  }
}
function isCorruptJson(text2) {
  return parseJson(text2) === void 0;
}
function decodeMeta(json) {
  const raw = parseJson(json);
  if (!raw || typeof raw !== "object" || isList(raw))
    return null;
  const record = raw;
  if (record.v !== 1 || typeof record.source !== "string")
    return null;
  return {
    v: 1,
    source: record.source,
    origin: isAllowedOrigin(record.origin) ? record.origin : "custom",
    modifiedAt: Number(record.modifiedAt) || 0,
    syncedAt: Number(record.syncedAt) || 0
  };
}
function decodePresets(json, meta, expectedSource) {
  if (!meta || meta.source !== expectedSource)
    return null;
  const raw = parseJson(json);
  if (!Array.isArray(raw))
    return null;
  return normalizeList(raw);
}

// src/panel/configPage.ts
var REQUEST_SCOPE = "config";
var REQUEST_TIMEOUT = 8e3;
function copyFields(source) {
  return {
    url: text(source.url),
    token: text(source.token),
    entityId: text(source.entityId),
    localPresets: strings(source.localPresets),
    cachedPresetsJson: text(source.cachedPresetsJson),
    cachedMetaJson: text(source.cachedMetaJson)
  };
}
function toLamps(value) {
  const result = [];
  if (!isList(value))
    return result;
  for (let i = 0; i < value.length; ++i) {
    const item = value[i];
    if (!item || typeof item !== "object")
      continue;
    const record = item;
    const entityId = text(record.entityId);
    if (entityId.length === 0)
      continue;
    result.push({ label: `${text(record.name) || entityId} (${entityId})`, entityId });
  }
  return result;
}
function indexOfLamp(lamps, entityId) {
  for (let i = 0; i < lamps.length; ++i) {
    const lamp = lamps[i];
    if (lamp && lamp.entityId === entityId)
      return i;
  }
  return -1;
}
function createConfigPage(host) {
  let started = false;
  let loadingLamps = false;
  let lamps = [];
  let selectedLampIndex = -1;
  let cacheStatus = "";
  let testText = "";
  let testTone = "neutral";
  let webSocketsAvailable = true;
  function fields() {
    return copyFields(host.fields());
  }
  function requestCfg(current) {
    return {
      url: current.url.trim(),
      token: current.token.trim(),
      scope: REQUEST_SCOPE,
      timeout: REQUEST_TIMEOUT
    };
  }
  function buildCacheStatus(current) {
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
    const date = meta.syncedAt > 0 ? host.formatTimestamp(meta.syncedAt) : host.translate("cfgNever");
    return host.translate("cfgCacheStatus", { count: presets.length, date });
  }
  function buildSnapshot() {
    return {
      loadingLamps,
      lamps,
      selectedLampIndex,
      cacheStatus,
      testText,
      testTone,
      webSocketsAvailable
    };
  }
  function render() {
    host.render(buildSnapshot());
  }
  function start() {
    if (started)
      return;
    started = true;
    webSocketsAvailable = host.probeWebSockets();
    cacheStatus = buildCacheStatus(fields());
    render();
  }
  function fieldsChanged() {
    cacheStatus = buildCacheStatus(fields());
    render();
  }
  function loadLamps() {
    const current = fields();
    if (loadingLamps)
      return;
    loadingLamps = true;
    testText = host.translate("cfgLoadingLamps");
    testTone = "neutral";
    render();
    host.fetchLights(requestCfg(current), function(value) {
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
    }, function(error) {
      loadingLamps = false;
      testText = host.translate("cfgError", host.errorText(error));
      testTone = "negative";
      render();
    });
  }
  function testConnection() {
    const current = fields();
    testText = host.translate("cfgTesting");
    testTone = "neutral";
    render();
    host.fetchState({
      url: current.url,
      token: current.token,
      entityId: current.entityId
    }, function(state) {
      const reported = state && typeof state === "object" ? state.state : void 0;
      if (reported) {
        testText = host.translate(reported === "on" ? "cfgConnectedOn" : "cfgConnectedOff");
        testTone = "positive";
      } else {
        testText = host.translate("cfgInvalidState");
        testTone = "neutral";
      }
      render();
    }, function(error) {
      testText = host.translate("cfgError", host.errorText(error));
      testTone = "negative";
      render();
    });
  }
  function selectLamp(index) {
    const lamp = lamps[index];
    if (!lamp)
      return;
    selectedLampIndex = index;
    render();
  }
  function snapshot() {
    return buildSnapshot();
  }
  return {
    start,
    fieldsChanged,
    loadLamps,
    testConnection,
    selectLamp,
    snapshot
  };
}
export {
  createConfigPage
};
