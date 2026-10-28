var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

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
function hsColor(hue, saturation) {
  return { hs_color: roundHs(hue, saturation) };
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
function hsToRgb(hs) {
  const values = toList(hs);
  if ((values == null ? void 0 : values.length) !== 2)
    return null;
  const rawHue = Number(values[0]);
  const rawSaturation = Number(values[1]);
  if (!isFiniteNumber(rawHue) || !isFiniteNumber(rawSaturation))
    return null;
  const hue = (rawHue % 360 + 360) % 360;
  const saturation = clamp(rawSaturation, 0, 100) / 100;
  const chroma = saturation;
  const offset = 1 - chroma;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs(segment % 2 - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) {
    red = chroma;
    green = x;
  } else if (segment < 2) {
    red = x;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = x;
  } else if (segment < 4) {
    green = x;
    blue = chroma;
  } else if (segment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }
  return [
    Math.round((red + offset) * 255),
    Math.round((green + offset) * 255),
    Math.round((blue + offset) * 255)
  ];
}
function rgbToHs(rgb) {
  const values = toList(rgb);
  if (!values || values.length < 3)
    return null;
  const rawRed = Number(values[0]);
  const rawGreen = Number(values[1]);
  const rawBlue = Number(values[2]);
  if (!isFiniteNumber(rawRed) || !isFiniteNumber(rawGreen) || !isFiniteNumber(rawBlue))
    return null;
  const red = clamp(rawRed, 0, 255) / 255;
  const green = clamp(rawGreen, 0, 255) / 255;
  const blue = clamp(rawBlue, 0, 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red)
      hue = (green - blue) / delta % 6;
    else if (maximum === green)
      hue = (blue - red) / delta + 2;
    else
      hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0)
      hue += 360;
  }
  const saturation = maximum === 0 ? 0 : delta / maximum;
  return [round2(hue), round2(saturation * 100)];
}
function gammaCorrect(value) {
  return value <= 31308e-7 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}
function xyToHs(xy) {
  const values = toList(xy);
  if ((values == null ? void 0 : values.length) !== 2)
    return null;
  const x = Number(values[0]);
  const y = Number(values[1]);
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || y <= 0)
    return null;
  const Y = 1;
  const X = Y / y * x;
  const Z = Y / y * (1 - x - y);
  const red = clamp(gammaCorrect(X * 1.656492 - Y * 0.354851 - Z * 0.255038), 0, 1);
  const green = clamp(gammaCorrect(-X * 0.707196 + Y * 1.655397 + Z * 0.036152), 0, 1);
  const blue = clamp(gammaCorrect(X * 0.051713 - Y * 0.121364 + Z * 1.01153), 0, 1);
  return rgbToHs([red * 255, green * 255, blue * 255]);
}
function matchMaxScale(inputColors, outputColors) {
  const maxIn = Math.max(...inputColors);
  const maxOut = Math.max(...outputColors);
  const factor = maxOut === 0 ? 0 : maxIn / maxOut;
  return outputColors.map((value) => Math.round(value * factor));
}
function kelvin2mired(kelvin) {
  return kelvin === 0 ? 1e6 : Math.floor(1e6 / kelvin);
}
function mired2kelvin(mired) {
  return mired === 0 ? 1e6 : Math.floor(1e6 / mired);
}
function rgbwToRgb(rgbw) {
  const [red, green, blue, white] = rgbw;
  const mixed = [red + white, green + white, blue + white];
  return matchMaxScale([red, green, blue, white], mixed);
}
function rgbwwToRgb(rgbww) {
  const [red, green, blue, coldWhite, warmWhite] = rgbww;
  const maxMireds = kelvin2mired(DEFAULT_MIN_KELVIN);
  const minMireds = kelvin2mired(DEFAULT_MAX_KELVIN);
  const range = maxMireds - minMireds;
  let ratio = 0.5;
  if (coldWhite + warmWhite !== 0)
    ratio = warmWhite / (coldWhite + warmWhite);
  const mired = minMireds + ratio * range;
  const kelvin = mired ? mired2kelvin(mired) : 0;
  const white = temperature2rgb(kelvin);
  const whiteLevel = Math.max(coldWhite, warmWhite) / 255;
  const mixed = [
    red + white[0] * whiteLevel,
    green + white[1] * whiteLevel,
    blue + white[2] * whiteLevel
  ];
  return matchMaxScale([red, green, blue, coldWhite, warmWhite], mixed);
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
function contains(list, spec) {
  const source = toList(list);
  return source ? indexOfCanonical(source, spec) >= 0 : false;
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

// src/colors/hex.ts
var SHORT_HEX = /^[0-9a-f]{3}$/i;
var LONG_HEX = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
function expandChannel(digits) {
  return parseInt(digits.length === 1 ? digits + digits : digits, 16);
}
function parseHex(hex) {
  const body = hex.charAt(0) === "#" ? hex.slice(1) : hex;
  if (SHORT_HEX.test(body))
    return [
      expandChannel(body.charAt(0)),
      expandChannel(body.charAt(1)),
      expandChannel(body.charAt(2))
    ];
  if (LONG_HEX.test(body))
    return [
      expandChannel(body.slice(0, 2)),
      expandChannel(body.slice(2, 4)),
      expandChannel(body.slice(4, 6))
    ];
  return null;
}
function fromHex(value) {
  if (typeof value !== "string")
    return null;
  const rgb = parseHex(value.trim());
  return rgb ? { rgb_color: rgb } : null;
}
function hexByte(value) {
  const text2 = Math.round(clamp(Number(value), 0, 255)).toString(16);
  return text2.length === 1 ? `0${text2}` : text2;
}
function rgbToHex(rgb) {
  const values = toList(rgb);
  if (!values || values.length < 3)
    return "";
  return `#${hexByte(values[0])}${hexByte(values[1])}${hexByte(values[2])}`;
}
function specToRgb(spec) {
  const normalized = normalize(spec);
  if (!normalized)
    return null;
  const color = classifyColor(normalized);
  switch (color.kind) {
    case "color_temp_kelvin":
      return temperature2rgb(color.value);
    case "hs_color":
      return hsToRgb(color.value);
    case "rgb_color": {
      const [red, green, blue] = color.value;
      return [red, green, blue];
    }
    case "rgbw_color":
      return rgbwToRgb(color.value);
    case "rgbww_color":
      return rgbwwToRgb(color.value);
  }
}
function specToHex(spec) {
  const rgb = specToRgb(spec);
  return rgb ? rgbToHex(rgb) : "";
}

// src/presets/list.ts
function presetItems(specs) {
  const source = toList(specs);
  const items = [];
  if (!source)
    return items;
  for (let i = 0; i < source.length; ++i) {
    const spec = normalize(source[i]);
    if (!spec)
      continue;
    items.push({ spec, hex: specToHex(spec) });
  }
  return items;
}
function specsFromHex(list) {
  const source = toList(list) || [];
  const result = [];
  for (let i = 0; i < source.length; ++i) {
    const spec = fromHex(source[i]);
    if (spec)
      result.push(spec);
  }
  return result;
}
function currentSpecForSync(currentSpec, supportsColor, hue01, saturation01) {
  let spec = currentSpec;
  if (!spec && supportsColor)
    spec = hsColor(hue01 * 360, saturation01 * 100);
  return normalize(spec);
}
function presetHexes(specs) {
  const source = toList(specs) || [];
  const hexes = [];
  for (let i = 0; i < source.length; ++i) {
    const hex = specToHex(source[i]);
    if (hex)
      hexes.push(hex);
  }
  return hexes;
}
function hasPreset(specs, spec) {
  return contains(specs, spec);
}
function indexOfHexSpec(localPresets, spec) {
  const list = toList(localPresets);
  if (!list)
    return -1;
  const key = canonical(spec);
  for (let i = 0; i < list.length; ++i) {
    const entry = fromHex(list[i]);
    if (entry && canonical(entry) === key)
      return i;
  }
  return -1;
}
function sameStringList(first, second) {
  const firstList = toList(first);
  const secondList = toList(second);
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

// src/presets/cache.ts
var ALLOWED_ORIGINS = ["custom", "defaults", "empty", "local"];
function isAllowedOrigin(value) {
  return typeof value === "string" && ALLOWED_ORIGINS.indexOf(value) >= 0;
}
function field(source, key) {
  if (!source || typeof source !== "object")
    return void 0;
  return source[key];
}
function localMeta() {
  return { v: 1, source: "", origin: "local", modifiedAt: 0, syncedAt: 0 };
}
function cleanMeta(meta, defaultSource, nowSeconds) {
  const source = field(meta, "source");
  const origin = field(meta, "origin");
  return {
    v: 1,
    source: (typeof source === "string" ? source : "") || String(defaultSource || ""),
    origin: isAllowedOrigin(origin) ? origin : "custom",
    modifiedAt: Number(field(meta, "modifiedAt")) || 0,
    syncedAt: Number(field(meta, "syncedAt")) || nowSeconds
  };
}
function encodePresets(list) {
  return JSON.stringify(normalizeList(list));
}
function encodeMeta(meta) {
  return JSON.stringify(meta);
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
function legacySpecs(localPresets) {
  return specsFromHex(localPresets);
}

// src/colors/defaults.ts
var COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

// src/panel/lampState.ts
function isArrayOf(attributes, key, length) {
  const value = attributes[key];
  return Array.isArray(value) && value.length === length;
}
function hasColorMode(modes) {
  return COLOR_MODES.some((mode) => modes.indexOf(mode) >= 0);
}
function currentColorSpec(attributes, fallback) {
  let spec = null;
  const mode = attributes.color_mode;
  if (mode === "color_temp" && attributes.color_temp_kelvin !== void 0 && attributes.color_temp_kelvin !== null) {
    spec = { color_temp_kelvin: attributes.color_temp_kelvin };
  } else if (mode === "rgbww" && isArrayOf(attributes, "rgbww_color", 5)) {
    spec = { rgbww_color: attributes.rgbww_color };
  } else if (mode === "rgbw" && isArrayOf(attributes, "rgbw_color", 4)) {
    spec = { rgbw_color: attributes.rgbw_color };
  } else if (mode === "rgb" && isArrayOf(attributes, "rgb_color", 3)) {
    spec = { rgb_color: attributes.rgb_color };
  } else if (mode === "hs" && isArrayOf(attributes, "hs_color", 2)) {
    spec = { hs_color: attributes.hs_color };
  } else if (mode === "xy") {
    if (isArrayOf(attributes, "hs_color", 2)) {
      spec = { hs_color: attributes.hs_color };
    } else if (isArrayOf(attributes, "xy_color", 2)) {
      const hs = xyToHs(attributes.xy_color);
      if (hs)
        spec = { hs_color: hs };
    }
  }
  if (!spec) {
    if (isArrayOf(attributes, "hs_color", 2))
      spec = { hs_color: attributes.hs_color };
    else if (isArrayOf(attributes, "rgb_color", 3))
      spec = { rgb_color: attributes.rgb_color };
    else if (attributes.color_temp_kelvin !== void 0 && attributes.color_temp_kelvin !== null)
      spec = { color_temp_kelvin: attributes.color_temp_kelvin };
    else if (isArrayOf(attributes, "rgbw_color", 4))
      spec = { rgbw_color: attributes.rgbw_color };
    else if (isArrayOf(attributes, "rgbww_color", 5))
      spec = { rgbww_color: attributes.rgbww_color };
    else if (fallback.supportsColor)
      spec = hsColor(fallback.hue01 * 360, fallback.saturation01 * 100);
  }
  return normalize(spec);
}
function parseLampState(state, entityId, fallback) {
  if (!state || typeof state !== "object")
    return null;
  const source = state;
  if (!source.state)
    return null;
  const attributes = source.attributes || {};
  const modes = toList(attributes.supported_color_modes) || [];
  const supportsColor = hasColorMode(modes);
  const name = attributes.friendly_name || entityId;
  const parsed = {
    available: source.state !== "unavailable" && source.state !== "unknown",
    lightOn: source.state === "on",
    displayName: typeof name === "string" ? name : String(name || ""),
    supportsColor,
    supportsColorTemp: modes.indexOf("color_temp") >= 0,
    supportedColorModes: modes,
    effectList: Array.isArray(attributes.effect_list) ? attributes.effect_list : [],
    currentColorSpec: currentColorSpec(attributes, {
      supportsColor,
      hue01: fallback.hue01,
      saturation01: fallback.saturation01
    })
  };
  if (attributes.brightness !== void 0 && attributes.brightness !== null)
    parsed.brightness = attributes.brightness;
  if (typeof attributes.effect === "string")
    parsed.currentEffect = attributes.effect;
  if (attributes.min_color_temp_kelvin)
    parsed.minKelvin = attributes.min_color_temp_kelvin;
  if (attributes.max_color_temp_kelvin)
    parsed.maxKelvin = attributes.max_color_temp_kelvin;
  if (attributes.color_temp_kelvin)
    parsed.colorTempKelvin = attributes.color_temp_kelvin;
  if (isArrayOf(attributes, "hs_color", 2)) {
    const hs = toList(attributes.hs_color) || [];
    parsed.hue01 = Number(hs[0]) / 360;
    parsed.saturation01 = Number(hs[1]) / 100;
  } else if (isArrayOf(attributes, "rgb_color", 3)) {
    const hs = rgbToHs(attributes.rgb_color);
    if (hs) {
      parsed.hue01 = hs[0] / 360;
      parsed.saturation01 = hs[1] / 100;
    }
  }
  return parsed;
}
function neutralLampState() {
  return {
    available: true,
    lightOn: false,
    brightness: 0,
    supportsColor: false,
    supportsColorTemp: false,
    supportedColorModes: [],
    currentColorSpec: null,
    effectList: [],
    currentEffect: "",
    minKelvin: 2e3,
    maxKelvin: 6500,
    colorTempKelvin: 3500,
    hue01: 0,
    saturation01: 0
  };
}
function hs01FromSpec(spec) {
  const hs = rgbToHs(specToRgb(spec));
  if (!hs)
    return null;
  return { hue01: hs[0] / 360, saturation01: hs[1] / 100 };
}
function hexFromHs(hue01, saturation01) {
  return specToHex(hsColor(hue01 * 360, saturation01 * 100));
}

// src/panel/session.ts
var KNOWN_STATES = [
  "off",
  "connecting",
  "auth",
  "syncing",
  "synced",
  "readonly",
  "cached",
  "unsupported",
  "error"
];
function toSyncState(value) {
  const text2 = String(value || "");
  for (const state of KNOWN_STATES) {
    if (state === text2)
      return state;
  }
  return "error";
}
function copyConfig(source) {
  return {
    url: text(source.url),
    token: text(source.token),
    entityId: text(source.entityId),
    pollInterval: Number(source.pollInterval) || 0,
    syncPresets: source.syncPresets === true,
    localPresets: strings(source.localPresets),
    cachedPresetsJson: text(source.cachedPresetsJson),
    cachedMetaJson: text(source.cachedMetaJson)
  };
}
function emptyConfig() {
  return copyConfig({
    url: "",
    token: "",
    entityId: "",
    pollInterval: 15,
    syncPresets: false,
    localPresets: [],
    cachedPresetsJson: "",
    cachedMetaJson: ""
  });
}
function neutralLamp() {
  return {
    available: true,
    lightOn: false,
    brightness: 0,
    hue01: 0,
    saturation01: 0,
    colorTempKelvin: 3500,
    minKelvin: 2e3,
    maxKelvin: 6500,
    supportsColor: false,
    supportsColorTemp: false,
    supportedColorModes: [],
    effectList: [],
    currentEffect: "",
    currentColorSpec: null,
    lightStateKnown: false
  };
}
function applyLampValues(target, values) {
  target.available = values.available;
  target.lightOn = values.lightOn;
  target.supportsColor = values.supportsColor;
  target.supportsColorTemp = values.supportsColorTemp;
  target.supportedColorModes = values.supportedColorModes;
  target.effectList = values.effectList;
  target.currentColorSpec = values.currentColorSpec;
  if (values.brightness !== void 0)
    target.brightness = values.brightness;
  if (values.currentEffect !== void 0)
    target.currentEffect = values.currentEffect;
  if (values.minKelvin !== void 0)
    target.minKelvin = values.minKelvin;
  if (values.maxKelvin !== void 0)
    target.maxKelvin = values.maxKelvin;
  if (values.colorTempKelvin !== void 0)
    target.colorTempKelvin = values.colorTempKelvin;
  if (values.hue01 !== void 0)
    target.hue01 = values.hue01;
  if (values.saturation01 !== void 0)
    target.saturation01 = values.saturation01;
}
function initialSnapshot() {
  const lamp = neutralLamp();
  return {
    connection: { url: "", token: "", entityId: "", timeout: 0, scope: "" },
    configured: false,
    pollIntervalSeconds: 3,
    requestTimeout: 2e3,
    lightAttributes: {
      supported_color_modes: [],
      min_color_temp_kelvin: lamp.minKelvin,
      max_color_temp_kelvin: lamp.maxKelvin
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
    toolTipSubText: ""
  };
}
function createSession(host) {
  const COLOR_APPLY_DELAY_MS = 200;
  const scope = host.createRequestScope();
  let started = false;
  let config = emptyConfig();
  let localPresets = [];
  const lamp = neutralLamp();
  let displayName = "";
  let statusText = "";
  let connected = false;
  let scheduledColor = null;
  let stateRequestId = 0;
  let stateRequestInFlight = false;
  let stateRefreshPending = false;
  let syncState = "off";
  let syncStatusText = "";
  let syncAdmin = false;
  let syncHasData = false;
  let syncRetryable = true;
  let cachedPresets = [];
  let cachedMeta = {};
  let cacheUsable = false;
  let serverPresets = [];
  let serverKnown = false;
  let cachedPresetsSource = "";
  let snapshotMemo = null;
  let connectionMemo = null;
  let attributesMemo = null;
  let attributesKey = "";
  let presetItemsMemo = [];
  let presetItemsMemoKey = "";
  let tooltipMemo = null;
  function pollIntervalSeconds() {
    return Math.max(3, config.pollInterval);
  }
  function requestTimeout() {
    return Math.max(2e3, Math.min(pollIntervalSeconds() * 1e3 - 500, 15e3));
  }
  function configured() {
    return Boolean(config.url && config.token && config.entityId);
  }
  function connection() {
    const timeout = requestTimeout();
    const current = connectionMemo;
    if (current && current.url === config.url && current.token === config.token && current.entityId === config.entityId && current.timeout === timeout)
      return current;
    connectionMemo = {
      url: config.url,
      token: config.token,
      entityId: config.entityId,
      timeout,
      scope
    };
    return connectionMemo;
  }
  function syncEnabled() {
    return config.syncPresets === true && configured();
  }
  function currentSourceKey() {
    return sourceKey(config.url, config.entityId);
  }
  function activeSourceKey() {
    return syncEnabled() ? currentSourceKey() : "";
  }
  function syncWritable() {
    return syncEnabled() && syncAdmin && syncHasData && syncState === "synced";
  }
  function lightAttributes() {
    const modes = lamp.supportedColorModes.map(String).join(",");
    const key = `${modes}|${lamp.minKelvin}|${lamp.maxKelvin}`;
    if (attributesMemo && key === attributesKey)
      return attributesMemo;
    attributesMemo = {
      supported_color_modes: lamp.supportedColorModes,
      min_color_temp_kelvin: lamp.minKelvin,
      max_color_temp_kelvin: lamp.maxKelvin
    };
    attributesKey = key;
    return attributesMemo;
  }
  function presetSpecs() {
    if (syncEnabled() && cacheUsable)
      return cachedPresets;
    if (syncEnabled() && cachedPresetsSource.length > 0 && cachedPresetsSource !== currentSourceKey())
      return [];
    return specsFromHex(localPresets);
  }
  function visiblePresets() {
    const specs = presetSpecs();
    const key = canonicalList(specs);
    if (key === presetItemsMemoKey)
      return presetItemsMemo;
    presetItemsMemo = presetItems(specs);
    presetItemsMemoKey = key;
    return presetItemsMemo;
  }
  function tooltip() {
    const main = displayName || config.entityId || host.translate("title");
    const hint = host.translate("tooltipHint");
    let sub;
    if (!configured())
      sub = host.translate("tooltipNotConfigured");
    else if (!connected)
      sub = `${statusText || host.translate("tooltipConnecting")}
${hint}`;
    else if (lamp.lightOn)
      sub = `${host.translate("tooltipOn", Math.round(lamp.brightness / 255 * 100))}
${hint}`;
    else
      sub = `${host.translate("tooltipOff")}
${hint}`;
    const key = [main, sub].join("\0");
    if (tooltipMemo && tooltipMemo.key === key)
      return tooltipMemo;
    tooltipMemo = { key, main, sub };
    return tooltipMemo;
  }
  function buildSnapshot() {
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
      displayName,
      statusText,
      connected,
      available: lamp.available,
      presetItems: visiblePresets(),
      syncEnabled: syncEnabled(),
      cachedSourceKey: currentSourceKey(),
      activeSourceKey: activeSourceKey(),
      syncWritable: syncWritable(),
      syncState,
      syncStatusText,
      syncAdmin,
      syncHasData,
      syncRetryable,
      cachedPresets,
      cachedMeta,
      cachedAvailable: cacheUsable,
      toolTipMainText: tips.main,
      toolTipSubText: tips.sub
    };
  }
  function render() {
    snapshotMemo = buildSnapshot();
    host.render(snapshotMemo);
  }
  function snapshot() {
    if (!snapshotMemo)
      snapshotMemo = buildSnapshot();
    return snapshotMemo;
  }
  function finishStateRequest() {
    stateRequestInFlight = false;
    if (stateRefreshPending) {
      stateRefreshPending = false;
      host.callLater(refresh);
    }
  }
  function refresh() {
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
    host.fetchState(connection(), function(state) {
      if (requestId !== stateRequestId)
        return;
      finishStateRequest();
      connected = true;
      statusText = "";
      applyState(state);
      render();
    }, function(error) {
      if (requestId !== stateRequestId)
        return;
      finishStateRequest();
      connected = false;
      statusText = host.errorText(error);
      render();
    });
  }
  function cancelPendingRequests() {
    host.cancelRequests(scope, "GET");
    ++stateRequestId;
    stateRequestInFlight = false;
    stateRefreshPending = false;
  }
  function applyState(state) {
    const parsed = parseLampState(state, config.entityId, {
      supportsColor: lamp.supportsColor,
      hue01: lamp.hue01,
      saturation01: lamp.saturation01
    });
    if (!parsed)
      return;
    displayName = parsed.displayName;
    applyLampValues(lamp, parsed);
    lamp.lightStateKnown = parsed.available;
  }
  function resetLampState() {
    applyLampValues(lamp, neutralLampState());
    lamp.lightStateKnown = false;
  }
  function reportError(error) {
    statusText = host.errorText(error);
    render();
  }
  function toggleLight() {
    cancelScheduledColor();
    if (!configured())
      return;
    host.toggle(connection(), function() {
      host.restartRefreshTimer();
      lamp.lightOn = !lamp.lightOn;
      render();
    }, reportError);
  }
  function previewBrightness(value) {
    lamp.brightness = value;
    render();
  }
  function previewColor(hue, saturation) {
    lamp.hue01 = hue;
    lamp.saturation01 = saturation;
    render();
  }
  function scheduleColor(hue, saturation) {
    previewColor(hue, saturation);
    scheduledColor = { hue, saturation };
    host.startColorTimer(COLOR_APPLY_DELAY_MS);
  }
  function cancelScheduledColor() {
    if (!scheduledColor)
      return;
    scheduledColor = null;
    host.stopColorTimer();
  }
  function applyScheduledColor() {
    const color = scheduledColor;
    scheduledColor = null;
    host.stopColorTimer();
    if (color)
      setColor(color.hue, color.saturation);
  }
  function previewColorTemp(kelvin) {
    lamp.colorTempKelvin = kelvin;
    render();
  }
  function setBrightness(value) {
    lamp.brightness = value;
    render();
    if (!configured())
      return;
    host.turnOn(connection(), { brightness: Math.round(value), transition: 0.4 }, function() {
      lamp.lightOn = true;
      render();
    }, reportError);
  }
  function setColor(hue, saturation) {
    cancelScheduledColor();
    lamp.hue01 = hue;
    lamp.saturation01 = saturation;
    const spec = hsColor(hue * 360, saturation * 100);
    lamp.currentColorSpec = spec;
    render();
    if (!configured())
      return;
    host.turnOn(connection(), { hs_color: spec.hs_color, transition: 0.4 }, function() {
      lamp.lightOn = true;
      render();
    }, reportError);
  }
  function setColorTemp(kelvin) {
    cancelScheduledColor();
    lamp.colorTempKelvin = kelvin;
    lamp.currentColorSpec = { color_temp_kelvin: Math.round(kelvin) };
    render();
    if (!configured())
      return;
    host.turnOn(connection(), { color_temp_kelvin: Math.round(kelvin), transition: 0.4 }, function() {
      lamp.lightOn = true;
      render();
    }, reportError);
  }
  function setEffect(effect) {
    lamp.currentEffect = effect;
    render();
    if (!configured())
      return;
    host.turnOn(connection(), { effect, transition: 0.4 }, function() {
      lamp.lightOn = true;
      render();
    }, reportError);
  }
  function flashLight() {
    if (!configured())
      return;
    host.turnOn(connection(), { flash: "short" }, void 0, reportError);
  }
  function applyPreset(spec) {
    const normalized = normalize(spec);
    if (!normalized || !configured())
      return;
    cancelScheduledColor();
    const attributes = { transition: 0.4 };
    const record = normalized;
    for (const key of Object.keys(record))
      attributes[key] = record[key];
    host.turnOn(connection(), attributes, function() {
      lamp.lightOn = true;
      lamp.currentColorSpec = normalized;
      applySpecToUi(normalized);
      render();
    }, reportError);
  }
  function applySpecToUi(spec) {
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
  function writeLocalPresets(list) {
    localPresets = list.slice();
    config = __spreadProps(__spreadValues({}, config), { localPresets: localPresets.slice() });
    host.setLocalPresets(localPresets.slice());
  }
  function writeColorPresets(json) {
    config = __spreadProps(__spreadValues({}, config), { cachedPresetsJson: json });
    host.setCachedPresetsJson(json);
  }
  function writeColorPresetsMeta(json) {
    config = __spreadProps(__spreadValues({}, config), { cachedMetaJson: json });
    host.setCachedMetaJson(json);
  }
  function updateLocalMirror(list) {
    writeColorPresets(encodePresets(specsFromHex(list)));
    writeColorPresetsMeta(encodeMeta(localMeta()));
    cachedPresetsSource = "";
  }
  function addLocalCurrentColor() {
    const hex = hexFromHs(lamp.hue01, lamp.saturation01);
    const list = localPresets.slice();
    if (list.indexOf(hex) === -1) {
      list.push(hex);
      writeLocalPresets(list);
      updateLocalMirror(list);
    }
    render();
  }
  function removeLocalPreset(index) {
    const item = visiblePresets()[index];
    if (!item)
      return;
    const list = localPresets.slice();
    const found = indexOfHexSpec(list, item.spec);
    if (found < 0)
      return;
    list.splice(found, 1);
    writeLocalPresets(list);
    updateLocalMirror(list);
    render();
  }
  function setSyncStatus(state, message) {
    syncState = state;
    if (state === "off") {
      syncStatusText = "";
      return;
    }
    const detail = message || "";
    syncStatusText = detail.length > 0 ? detail : defaultSyncStatusText(state);
  }
  function defaultSyncStatusText(state) {
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
  function persistPresets(presets, meta) {
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
  function loadCachedPresets() {
    cachedPresets = [];
    cachedMeta = {};
    cacheUsable = false;
    serverPresets = [];
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
  function migrateLocalPresets() {
    if (config.cachedPresetsJson.length > 0)
      return;
    const specs = legacySpecs(config.localPresets);
    if (specs.length === 0)
      return;
    writeColorPresets(encodePresets(specs));
    writeColorPresetsMeta(encodeMeta(localMeta()));
    cachedPresetsSource = "";
  }
  function metaSource(meta) {
    if (!meta || typeof meta !== "object")
      return "";
    const source = meta.source;
    return typeof source === "string" ? source : "";
  }
  function applyPresetsFromSync(presets, meta) {
    if (!syncEnabled())
      return;
    if (metaSource(meta) !== currentSourceKey())
      return;
    const server = meta && isList(meta.serverPresets) ? meta.serverPresets : presets;
    serverPresets = normalizeList(server);
    serverKnown = true;
    persistPresets(presets, meta);
    render();
  }
  function restoreServerPresets() {
    if (!serverKnown) {
      setSyncStatus("error", host.translate("syncRestoreFailed"));
      return;
    }
    persistPresets(serverPresets, cachedMeta);
  }
  function addCurrentPreset() {
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
  function removePreset(index) {
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
  function sourceKeysChanged() {
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
  function handlePermissionChanged(admin) {
    syncAdmin = admin === true;
    render();
  }
  function handleWriteForbidden(message) {
    syncAdmin = false;
    restoreServerPresets();
    setSyncStatus("readonly", text(message));
    render();
  }
  function handleAuthFailed(message) {
    syncAdmin = false;
    setSyncStatus("error", text(message));
    render();
  }
  function handleStatusChanged(state, message) {
    setSyncStatus(toSyncState(state), text(message));
    render();
  }
  function retrySync() {
    if (!syncEnabled())
      return;
    const item = host.syncModule();
    if (!item) {
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
  function loaderFailed(detail) {
    const message = text(detail);
    const noWebSockets = /qt\s*websockets/i.test(message);
    syncAdmin = false;
    syncRetryable = !noWebSockets;
    setSyncStatus("error", noWebSockets ? host.errorText({ code: "syncNoWebSockets" }) : host.errorText({ code: "syncLoadError", detail: message }));
    render();
  }
  function loaderReady() {
    syncRetryable = true;
    render();
  }
  function setConfig(next) {
    const previous = config;
    const nextConfig = copyConfig(next);
    if (!started) {
      config = nextConfig;
      localPresets = nextConfig.localPresets.slice();
      return;
    }
    config = nextConfig;
    const connectionChanged = nextConfig.url !== previous.url || nextConfig.token !== previous.token || nextConfig.entityId !== previous.entityId || nextConfig.pollInterval !== previous.pollInterval;
    const sourceChanged = sourceKey(nextConfig.url, nextConfig.entityId) !== sourceKey(previous.url, previous.entityId);
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
      render();
      if (connectionChanged)
        refresh();
    }
  }
  function start() {
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
    start,
    setConfig,
    snapshot,
    refresh,
    cancelPendingRequests,
    toggleLight,
    previewBrightness,
    previewColor,
    scheduleColor,
    applyScheduledColor,
    previewColorTemp,
    setBrightness,
    setColor,
    setColorTemp,
    setEffect,
    flashLight,
    applyPreset,
    addCurrentPreset,
    removePreset,
    retrySync,
    handlePresetsPulled: applyPresetsFromSync,
    handlePresetsPushed: applyPresetsFromSync,
    handleStatusChanged,
    handleAuthFailed,
    handleWriteForbidden,
    handlePermissionChanged,
    loaderFailed,
    loaderReady
  };
}
export {
  createSession,
  initialSnapshot
};
