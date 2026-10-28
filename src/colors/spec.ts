import {
    clamp,
    isFiniteNumber,
    isList,
    roundedInt,
    roundHs,
    toList,
} from "./convert.ts";
import type {
    ColorOp,
    HsColor,
    LightColor,
    RgbColor,
    RgbwColor,
    RgbwwColor,
} from "./types.ts";

export type ClassifiedColor =
    | { kind: "color_temp_kelvin"; value: number }
    | { kind: "hs_color"; value: HsColor }
    | { kind: "rgb_color"; value: RgbColor }
    | { kind: "rgbw_color"; value: RgbwColor }
    | { kind: "rgbww_color"; value: RgbwwColor };

// Single place that tells the color models apart; pass only normalize() output.
export function classifyColor(spec: LightColor): ClassifiedColor {
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

function readChannels(value: unknown, size: 3): RgbColor | null;
function readChannels(value: unknown, size: 4): RgbwColor | null;
function readChannels(value: unknown, size: 5): RgbwwColor | null;
function readChannels(value: unknown, size: number): number[] | null {
    const source = toList(value);
    if (source?.length !== size)
        return null;

    const channels: number[] = [];
    for (const channel of source) {
        const value = Number(channel);
        if (!isFiniteNumber(value))
            return null;
        channels.push(roundedInt(value, 0, 255));
    }
    return channels;
}

export function normalize(spec: unknown): LightColor | null {
    if (!spec || typeof spec !== "object" || isList(spec))
        return null;

    const record = spec as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, "color_temp_kelvin")) {
        // Number(null) is 0: a null kelvin must not become a 0 K color. Reject it.
        if (record.color_temp_kelvin === null || record.color_temp_kelvin === undefined)
            return null;
        const value = Number(record.color_temp_kelvin);
        if (!isFiniteNumber(value) || value <= 0)
            return null;
        return { color_temp_kelvin: Math.round(value) };
    }

    if (record.hs_color !== undefined) {
        const values = toList(record.hs_color);
        if (values?.length !== 2)
            return null;
        const hue = Number(values[0]);
        const saturation = Number(values[1]);
        if (!isFiniteNumber(hue) || !isFiniteNumber(saturation))
            return null;
        return { hs_color: roundHs(hue, saturation) };
    }

    if (record.rgb_color !== undefined) {
        const values = readChannels(record.rgb_color, 3);
        return values ? { rgb_color: values } : null;
    }
    if (record.rgbw_color !== undefined) {
        const values = readChannels(record.rgbw_color, 4);
        return values ? { rgbw_color: values } : null;
    }
    if (record.rgbww_color !== undefined) {
        const values = readChannels(record.rgbww_color, 5);
        return values ? { rgbww_color: values } : null;
    }

    return null;
}

export function normalizeList(list: unknown): LightColor[] {
    const source = toList(list);
    const result: LightColor[] = [];
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

// Coarse identity key: hue wrapped to 0..359, both components whole numbers.
export function canonicalHs(hs: ArrayLike<unknown>): string {
    const hue = Math.round(((Number(hs[0]) % 360) + 360) % 360) % 360;
    const saturation = Math.round(clamp(Number(hs[1]), 0, 100));
    return `${hue},${saturation}`;
}

// Key format: "ct:<kelvin>", "hs:<hue>,<sat>", "rgb:<r>,<g>,<b>", ...; "" if invalid.
export function canonical(spec: unknown): string {
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

function indexOfCanonical(list: ArrayLike<unknown>, spec: unknown): number {
    const key = canonical(spec);
    if (!key)
        return -1;

    for (let i = 0; i < list.length; ++i) {
        if (canonical(list[i]) === key)
            return i;
    }
    return -1;
}

export function contains(list: unknown, spec: unknown): boolean {
    const source = toList(list);
    return source ? indexOfCanonical(source, spec) >= 0 : false;
}

export function canonicalList(list: unknown): string {
    const source = toList(list);
    const result: string[] = [];
    if (!source)
        return "";

    for (let i = 0; i < source.length; ++i) {
        const key = canonical(source[i]);
        if (key)
            result.push(key);
    }
    return result.join("|");
}

function toColorOp(value: unknown): ColorOp | null {
    if (!value || typeof value !== "object")
        return null;

    const raw = value as { type?: unknown; spec?: unknown };
    if (raw.type !== "add" && raw.type !== "remove")
        return null;

    const spec = normalize(raw.spec);
    return spec ? { type: raw.type, spec } : null;
}

/** Applies edits in order; add is idempotent, remove deletes one match. */
export function applyOps(list: unknown, ops: unknown): LightColor[] {
    const result = normalizeList(list);
    const source = toList(ops);
    if (!source)
        return result;

    for (const item of source) {
        const operation = toColorOp(item);
        if (!operation)
            continue;

        if (operation.type === "add") {
            // Check the accumulating list: a batch may repeat the same add.
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
