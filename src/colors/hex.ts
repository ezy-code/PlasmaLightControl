import { clamp, hsToRgb, rgbwToRgb, rgbwwToRgb, temperature2rgb, toList } from "./convert.ts";
import { classifyColor, normalize } from "./spec.ts";
import type { RgbColor, RgbColorSpec } from "./types.ts";

const SHORT_HEX = /^[0-9a-f]{3}$/i;
const LONG_HEX = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

function expandChannel(digits: string): number {
    return parseInt(digits.length === 1 ? digits + digits : digits, 16);
}

// Accepts "#rgb", "#rrggbb", "#rrggbbaa" (alpha ignored); "#" is optional.
function parseHex(hex: string): RgbColor | null {
    const body = hex.charAt(0) === "#" ? hex.slice(1) : hex;

    if (SHORT_HEX.test(body))
        return [
            expandChannel(body.charAt(0)),
            expandChannel(body.charAt(1)),
            expandChannel(body.charAt(2)),
        ];
    if (LONG_HEX.test(body))
        return [
            expandChannel(body.slice(0, 2)),
            expandChannel(body.slice(2, 4)),
            expandChannel(body.slice(4, 6)),
        ];
    return null;
}

export function fromHex(value: unknown): RgbColorSpec | null {
    if (typeof value !== "string")
        return null;

    const rgb = parseHex(value.trim());
    return rgb ? { rgb_color: rgb } : null;
}

function hexByte(value: unknown): string {
    const text = Math.round(clamp(Number(value), 0, 255)).toString(16);
    return text.length === 1 ? `0${text}` : text;
}

export function rgbToHex(rgb: unknown): string {
    const values = toList(rgb);
    if (!values || values.length < 3)
        return "";

    return `#${hexByte(values[0])}${hexByte(values[1])}${hexByte(values[2])}`;
}

export function specToRgb(spec: unknown): RgbColor | null {
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
            // Copy: the returned array belongs to the caller.
            const [red, green, blue] = color.value;
            return [red, green, blue];
        }
        case "rgbw_color":
            return rgbwToRgb(color.value);
        case "rgbww_color":
            return rgbwwToRgb(color.value);
    }
}

export function specToHex(spec: unknown): string {
    const rgb = specToRgb(spec);
    return rgb ? rgbToHex(rgb) : "";
}
