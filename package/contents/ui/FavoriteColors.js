.pragma library

// Helpers for Home Assistant light favorite colors.
// A favorite color ("LightColor") is one of:
//   { color_temp_kelvin: number }
//   { hs_color: [number, number] }
//   { rgb_color: [number, number, number] }
//   { rgbw_color: [number, number, number, number] }
//   { rgbww_color: [number, number, number, number, number] }

const COLOR_TEMP_COUNT = 4;
const DEFAULT_MIN_KELVIN = 2700;
const DEFAULT_MAX_KELVIN = 6500;

const DEFAULT_COLORED_COLORS = [
    { rgb_color: [127, 172, 255] }, // #7FACFF
    { rgb_color: [215, 150, 255] }, // #D796FF
    { rgb_color: [255, 158, 243] }, // #FF9EF3
    { rgb_color: [255, 110, 84] }   // #FF6E54
];

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
}

// Arrays crossing a QML signal boundary arrive as array-like values that
// Array.isArray() rejects (QVariantList/QJSValue sequences). Treat both the
// same way and always work with real JavaScript arrays internally.
function isList(value) {
    return value !== null && value !== undefined && typeof value === "object"
        && typeof value.length === "number";
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

// One rounding rule for hs_color, no matter where the value came from: the
// lamp state (Home Assistant sends fractions such as 2.88) or the color wheel.
function roundHs(hue, saturation) {
    return [round2(clamp(hue, 0, 360)), round2(clamp(saturation, 0, 100))];
}

function hsColor(hue, saturation) {
    return { hs_color: roundHs(hue, saturation) };
}

// Port of temperature2rgb() from the Home Assistant frontend.
function temperature2rgb(kelvin) {
    const value = kelvin / 100;

    function red(temperature) {
        if (temperature <= 66)
            return 255;
        return clamp(329.698727446 * Math.pow(temperature - 60, -0.1332047592), 0, 255);
    }

    function green(temperature) {
        if (temperature <= 66)
            return clamp(99.4708025861 * Math.log(temperature) - 161.1195681661, 0, 255);
        return clamp(288.1221695283 * Math.pow(temperature - 60, -0.0755148492), 0, 255);
    }

    function blue(temperature) {
        if (temperature >= 66)
            return 255;
        if (temperature <= 19)
            return 0;
        return clamp(138.5177312231 * Math.log(temperature - 10) - 305.0447927307, 0, 255);
    }

    return [
        Math.round(red(value)),
        Math.round(green(value)),
        Math.round(blue(value))
    ];
}

function hsToRgb(hs) {
    const values = toList(hs);
    if (!values || values.length !== 2)
        return null;

    const hue = ((Number(values[0]) % 360) + 360) % 360;
    const saturation = clamp(Number(values[1]), 0, 100) / 100;
    if (!isFiniteNumber(hue) || !isFiniteNumber(saturation))
        return null;

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

    const red = clamp(Number(values[0]), 0, 255) / 255;
    const green = clamp(Number(values[1]), 0, 255) / 255;
    const blue = clamp(Number(values[2]), 0, 255) / 255;
    if (!isFiniteNumber(red) || !isFiniteNumber(green) || !isFiniteNumber(blue))
        return null;

    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;

    let hue = 0;
    if (delta !== 0) {
        if (maximum === red)
            hue = ((green - blue) / delta) % 6;
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

// Home Assistant's xy -> RGB conversion (sRGB, D65) followed by RGB -> HS.
function xyToHs(xy) {
    const values = toList(xy);
    if (!values || values.length !== 2)
        return null;

    const x = Number(values[0]);
    const y = Number(values[1]);
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || y <= 0)
        return null;

    const Y = 1.0;
    const X = (Y / y) * x;
    const Z = (Y / y) * (1 - x - y);

    let red = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let green = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let blue = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    function gammaCorrect(value) {
        return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
    }

    red = clamp(gammaCorrect(red), 0, 1);
    green = clamp(gammaCorrect(green), 0, 1);
    blue = clamp(gammaCorrect(blue), 0, 1);

    return rgbToHs([red * 255, green * 255, blue * 255]);
}

function matchMaxScale(inputColors, outputColors) {
    const maxIn = Math.max.apply(null, inputColors);
    const maxOut = Math.max.apply(null, outputColors);
    const factor = maxOut === 0 ? 0 : maxIn / maxOut;
    const result = [];
    for (let i = 0; i < outputColors.length; ++i)
        result.push(Math.round(outputColors[i] * factor));
    return result;
}

function kelvin2mired(kelvin) {
    return kelvin === 0 ? 1000000 : Math.floor(1000000 / kelvin);
}

function mired2kelvin(mired) {
    return mired === 0 ? 1000000 : Math.floor(1000000 / mired);
}

function rgbwToRgb(rgbw) {
    const r = rgbw[0];
    const g = rgbw[1];
    const b = rgbw[2];
    const w = rgbw[3];
    return matchMaxScale([r, g, b, w], [r + w, g + w, b + w]);
}

function rgbwwToRgb(rgbww) {
    const r = rgbww[0];
    const g = rgbww[1];
    const b = rgbww[2];
    const cw = rgbww[3];
    const ww = rgbww[4];

    const maxMireds = kelvin2mired(DEFAULT_MIN_KELVIN);
    const minMireds = kelvin2mired(DEFAULT_MAX_KELVIN);
    const range = maxMireds - minMireds;
    let ratio = 0.5;
    if (cw + ww !== 0)
        ratio = ww / (cw + ww);

    const mired = minMireds + ratio * range;
    const kelvin = mired ? mired2kelvin(mired) : 0;
    const white = temperature2rgb(kelvin);
    const whiteLevel = Math.max(cw, ww) / 255;
    const mixed = [
        r + white[0] * whiteLevel,
        g + white[1] * whiteLevel,
        b + white[2] * whiteLevel
    ];
    return matchMaxScale([r, g, b, cw, ww], mixed);
}

// Accepts either a LightColor object or a Home Assistant state-like object
// with an "attributes" key.
function computeDefaults(state) {
    const attributes = state && state.attributes ? state.attributes : (state || {});
    const modes = toList(attributes.supported_color_modes) || [];

    function supports(mode) {
        return modes.indexOf(mode) >= 0;
    }

    let supportsColor = false;
    for (let i = 0; i < COLOR_MODES.length; ++i) {
        if (supports(COLOR_MODES[i])) {
            supportsColor = true;
            break;
        }
    }

    const colors = [];

    if (supports("color_temp")) {
        const minimum = isFiniteNumber(attributes.min_color_temp_kelvin)
            ? attributes.min_color_temp_kelvin : DEFAULT_MIN_KELVIN;
        const maximum = isFiniteNumber(attributes.max_color_temp_kelvin)
            ? attributes.max_color_temp_kelvin : DEFAULT_MAX_KELVIN;
        const step = (maximum - minimum) / (COLOR_TEMP_COUNT - 1);
        for (let i = 0; i < COLOR_TEMP_COUNT; ++i)
            colors.push({ color_temp_kelvin: Math.round(minimum + step * i) });
    } else if (supportsColor) {
        const minimum = 2000;
        const maximum = 6500;
        const step = (maximum - minimum) / (COLOR_TEMP_COUNT - 1);
        for (let i = 0; i < COLOR_TEMP_COUNT; ++i)
            colors.push({ rgb_color: temperature2rgb(Math.round(minimum + step * i)) });
    }

    if (supportsColor) {
        for (let i = 0; i < DEFAULT_COLORED_COLORS.length; ++i) {
            const spec = DEFAULT_COLORED_COLORS[i];
            colors.push({ rgb_color: spec.rgb_color.slice() });
        }
    }

    return colors;
}

function normalize(spec) {
    if (!spec || typeof spec !== "object" || isList(spec))
        return null;

    if (Object.prototype.hasOwnProperty.call(spec, "color_temp_kelvin")) {
        // Number(null) is 0: a null/undefined kelvin must not turn into a
        // black-body color at 0 K. Reject it instead of coercing.
        if (spec.color_temp_kelvin === null || spec.color_temp_kelvin === undefined)
            return null;
        const value = Number(spec.color_temp_kelvin);
        if (!isFiniteNumber(value) || value <= 0)
            return null;
        return { color_temp_kelvin: Math.round(value) };
    }

    if (spec.hs_color !== undefined) {
        const values = toList(spec.hs_color);
        if (!values || values.length !== 2)
            return null;
        const hue = Number(values[0]);
        const saturation = Number(values[1]);
        if (!isFiniteNumber(hue) || !isFiniteNumber(saturation))
            return null;
        return { hs_color: roundHs(hue, saturation) };
    }

    if (spec.rgb_color !== undefined) {
        const source = toList(spec.rgb_color);
        if (!source || source.length !== 3)
            return null;
        const values = [];
        for (let i = 0; i < 3; ++i) {
            const value = Number(source[i]);
            if (!isFiniteNumber(value))
                return null;
            values.push(roundedInt(value, 0, 255));
        }
        return { rgb_color: values };
    }

    if (spec.rgbw_color !== undefined) {
        const source = toList(spec.rgbw_color);
        if (!source || source.length !== 4)
            return null;
        const values = [];
        for (let i = 0; i < 4; ++i) {
            const value = Number(source[i]);
            if (!isFiniteNumber(value))
                return null;
            values.push(roundedInt(value, 0, 255));
        }
        return { rgbw_color: values };
    }

    if (spec.rgbww_color !== undefined) {
        const source = toList(spec.rgbww_color);
        if (!source || source.length !== 5)
            return null;
        const values = [];
        for (let i = 0; i < 5; ++i) {
            const value = Number(source[i]);
            if (!isFiniteNumber(value))
                return null;
            values.push(roundedInt(value, 0, 255));
        }
        return { rgbww_color: values };
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
            console.warn("FavoriteColors: ignoring invalid favorite color at index " + i);
    }
    return result;
}

// Comparison key for hs_color: hue is wrapped to 0..359 and both components
// are quantized to whole numbers. The stored values stay untouched; only the
// identity key is coarse, so [180, 2.88] and [180, 3] are the same color.
function canonicalHs(hs) {
    const hue = Math.round(((Number(hs[0]) % 360) + 360) % 360) % 360;
    const saturation = Math.round(clamp(Number(hs[1]), 0, 100));
    return hue + "," + saturation;
}

function canonical(spec) {
    const normalized = normalize(spec);
    if (!normalized)
        return "";

    if (normalized.color_temp_kelvin !== undefined)
        return "ct:" + normalized.color_temp_kelvin;
    if (normalized.hs_color)
        return "hs:" + canonicalHs(normalized.hs_color);
    if (normalized.rgb_color)
        return "rgb:" + normalized.rgb_color.join(",");
    if (normalized.rgbw_color)
        return "rgbw:" + normalized.rgbw_color.join(",");
    if (normalized.rgbww_color)
        return "rgbww:" + normalized.rgbww_color.join(",");
    return "";
}

// True when `list` already contains a color equivalent to `spec`.
function contains(list, spec) {
    const key = canonical(spec);
    if (!key)
        return false;

    const source = toList(list);
    if (!source)
        return false;

    for (let i = 0; i < source.length; ++i) {
        if (canonical(source[i]) === key)
            return true;
    }
    return false;
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

function sameList(first, second) {
    return canonicalList(first) === canonicalList(second);
}

function applyOps(list, ops) {
    const result = normalizeList(list);
    const source = toList(ops);
    if (!source)
        return result;

    for (let i = 0; i < source.length; ++i) {
        const operation = source[i];
        if (!operation || !operation.type)
            continue;
        const spec = normalize(operation.spec);
        if (!spec)
            continue;

        if (operation.type === "add") {
            // Check the accumulating list: another client may have added the
            // color already, and a batch may contain the same add twice.
            if (!contains(result, spec))
                result.push(spec);
        } else if (operation.type === "remove") {
            const key = canonical(spec);
            for (let j = 0; j < result.length; ++j) {
                if (canonical(result[j]) === key) {
                    result.splice(j, 1);
                    break;
                }
            }
        }
    }
    return result;
}

function fromHex(value) {
    if (typeof value !== "string")
        return null;

    let hex = value.trim();
    if (hex.length === 0)
        return null;
    if (hex.charAt(0) !== "#")
        hex = "#" + hex;

    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = "#" + hex.charAt(1) + hex.charAt(1)
            + hex.charAt(2) + hex.charAt(2)
            + hex.charAt(3) + hex.charAt(3);
    }

    const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/.exec(hex);
    if (!match)
        return null;

    return {
        rgb_color: [
            parseInt(match[1], 16),
            parseInt(match[2], 16),
            parseInt(match[3], 16)
        ]
    };
}

function isSupportedSpec(spec) {
    return normalize(spec) !== null;
}

function specToRgb(spec) {
    const normalized = normalize(spec);
    if (!normalized)
        return null;

    if (normalized.color_temp_kelvin !== undefined)
        return temperature2rgb(normalized.color_temp_kelvin);
    if (normalized.hs_color)
        return hsToRgb(normalized.hs_color);
    if (normalized.rgb_color)
        return normalized.rgb_color.slice();
    if (normalized.rgbw_color)
        return rgbwToRgb(normalized.rgbw_color);
    if (normalized.rgbww_color)
        return rgbwwToRgb(normalized.rgbww_color);
    return null;
}

function rgbToHex(rgb) {
    const values = toList(rgb);
    if (!values || values.length < 3)
        return "";

    function toHex(value) {
        const text = Math.round(clamp(Number(value), 0, 255)).toString(16);
        return text.length === 1 ? "0" + text : text;
    }

    return "#" + toHex(values[0]) + toHex(values[1]) + toHex(values[2]);
}

function specToHex(spec) {
    const rgb = specToRgb(spec);
    return rgb ? rgbToHex(rgb) : "";
}
