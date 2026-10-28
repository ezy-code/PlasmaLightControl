import { hsColor, rgbToHs, toList, xyToHs } from "../colors/convert.ts";
import { COLOR_MODES } from "../colors/defaults.ts";
import { specToHex, specToRgb } from "../colors/hex.ts";
import { normalize } from "../colors/spec.ts";
import type { LightColor } from "../colors/types.ts";

// Wheel position (0..1), used only when the lamp reports no color at all.
export interface ColorFallback {
    supportsColor: boolean;
    hue01: number;
    saturation01: number;
}

/** Hue and saturation in the 0..1 form the QML properties use. */
export interface Hs01 {
    hue01: number;
    saturation01: number;
}

export interface ParsedLampState {
    available: boolean;
    lightOn: boolean;
    displayName: string;
    /** Only present when the lamp reported a brightness. */
    brightness?: number;
    supportsColor: boolean;
    supportsColorTemp: boolean;
    supportedColorModes: unknown[];
    /** Only present when the lamp reported the matching attribute. */
    minKelvin?: number;
    maxKelvin?: number;
    colorTempKelvin?: number;
    /** Only present when the lamp reported hs_color or rgb_color. */
    hue01?: number;
    saturation01?: number;
    effectList: unknown[];
    currentEffect?: string;
    currentColorSpec: LightColor | null;
}

export type LampValues = Omit<ParsedLampState, "displayName">;

function isArrayOf(attributes: Record<string, unknown>, key: string, length: number): boolean {
    const value = attributes[key];
    return Array.isArray(value) && value.length === length;
}

function hasColorMode(modes: unknown[]): boolean {
    return COLOR_MODES.some((mode) => modes.indexOf(mode) >= 0);
}

// Current color in HA's color_mode priority, then any color attribute, then wheel.
export function currentColorSpec(attributes: Record<string, unknown>, fallback: ColorFallback): LightColor | null {
    let spec: unknown = null;
    const mode = attributes.color_mode;

    if (mode === "color_temp" && attributes.color_temp_kelvin !== undefined
            && attributes.color_temp_kelvin !== null) {
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
        else if (attributes.color_temp_kelvin !== undefined
                 && attributes.color_temp_kelvin !== null)
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

// Validates a state payload; `fallback` is the wheel position from before it.
export function parseLampState(
    state: unknown,
    entityId: unknown,
    fallback: ColorFallback,
): ParsedLampState | null {
    if (!state || typeof state !== "object")
        return null;

    const source = state as { state?: unknown; attributes?: unknown };
    if (!source.state)
        return null;

    const attributes = (source.attributes || {}) as Record<string, unknown>;
    const modes = toList(attributes.supported_color_modes) || [];
    const supportsColor = hasColorMode(modes);
    const name = attributes.friendly_name || entityId;

    const parsed: ParsedLampState = {
        available: source.state !== "unavailable" && source.state !== "unknown",
        lightOn: source.state === "on",
        displayName: typeof name === "string" ? name : String(name || ""),
        supportsColor: supportsColor,
        supportsColorTemp: modes.indexOf("color_temp") >= 0,
        supportedColorModes: modes,
        effectList: Array.isArray(attributes.effect_list) ? attributes.effect_list : [],
        currentColorSpec: currentColorSpec(attributes, {
            supportsColor: supportsColor,
            hue01: fallback.hue01,
            saturation01: fallback.saturation01,
        }),
    };

    if (attributes.brightness !== undefined && attributes.brightness !== null)
        parsed.brightness = attributes.brightness as number;

    if (typeof attributes.effect === "string")
        parsed.currentEffect = attributes.effect;

    if (attributes.min_color_temp_kelvin)
        parsed.minKelvin = attributes.min_color_temp_kelvin as number;
    if (attributes.max_color_temp_kelvin)
        parsed.maxKelvin = attributes.max_color_temp_kelvin as number;
    if (attributes.color_temp_kelvin)
        parsed.colorTempKelvin = attributes.color_temp_kelvin as number;

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

// Reset values after a URL/entity change; must never leak the previous lamp.
export function neutralLampState(): LampValues {
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
        minKelvin: 2000,
        maxKelvin: 6500,
        colorTempKelvin: 3500,
        hue01: 0,
        saturation01: 0,
    };
}

// Hue/saturation 0..1 of any spec, rounded like every other hs_color.
export function hs01FromSpec(spec: unknown): Hs01 | null {
    const hs = rgbToHs(specToRgb(spec));
    if (!hs)
        return null;
    return { hue01: hs[0] / 360, saturation01: hs[1] / 100 };
}

/** "#rrggbb" for the wheel position, e.g. for a locally saved preset. */
export function hexFromHs(hue01: number, saturation01: number): string {
    return specToHex(hsColor(hue01 * 360, saturation01 * 100));
}
