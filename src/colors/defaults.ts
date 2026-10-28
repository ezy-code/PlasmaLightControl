import {
    DEFAULT_MAX_KELVIN,
    DEFAULT_MIN_KELVIN,
    isFiniteNumber,
    temperature2rgb,
    toList,
} from "./convert.ts";
import type { LightColor, RgbColorSpec } from "./types.ts";

export const COLOR_TEMP_COUNT = 4;

export const DEFAULT_COLORED_COLORS: readonly RgbColorSpec[] = [
    { rgb_color: [127, 172, 255] }, // #7FACFF
    { rgb_color: [215, 150, 255] }, // #D796FF
    { rgb_color: [255, 158, 243] }, // #FF9EF3
    { rgb_color: [255, 110, 84] },  // #FF6E54
];

export const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

// Fixed warm-to-cool anchors: the lamp's own color_temp bounds do not apply here.
const APPROX_MIN_KELVIN = 2000;
const APPROX_MAX_KELVIN = 6500;

function spreadKelvin(minimum: number, maximum: number, count: number): number[] {
    const step = (maximum - minimum) / (count - 1);
    const values: number[] = [];
    for (let i = 0; i < count; ++i)
        values.push(Math.round(minimum + step * i));
    return values;
}

// QML calls this with either { attributes } or the bare attributes object.
function attributesOf(state: unknown): Record<string, unknown> {
    if (!state || typeof state !== "object")
        return {};

    const source = state as { attributes?: unknown };
    return (source.attributes || state) as Record<string, unknown>;
}

/** Copies a spec: the caller must never be able to mutate the shared defaults. */
function cloneRgb(spec: RgbColorSpec): RgbColorSpec {
    const [red, green, blue] = spec.rgb_color;
    return { rgb_color: [red, green, blue] };
}

function hasAnyColorMode(modes: unknown[]): boolean {
    return COLOR_MODES.some((mode) => modes.indexOf(mode) >= 0);
}

function defaultColors(modes: unknown[], attributes: Record<string, unknown>): LightColor[] {
    const colors: LightColor[] = [];
    const colored = hasAnyColorMode(modes);

    if (modes.indexOf("color_temp") >= 0) {
        const minimum = isFiniteNumber(attributes.min_color_temp_kelvin)
            ? attributes.min_color_temp_kelvin : DEFAULT_MIN_KELVIN;
        const maximum = isFiniteNumber(attributes.max_color_temp_kelvin)
            ? attributes.max_color_temp_kelvin : DEFAULT_MAX_KELVIN;
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

export function computeDefaults(state: unknown): LightColor[] {
    const attributes = attributesOf(state);
    const modes = toList(attributes.supported_color_modes) || [];
    return defaultColors(modes, attributes);
}
