import { hsColor, toList } from "../colors/convert.ts";
import { fromHex, specToHex } from "../colors/hex.ts";
import { canonical, contains, normalize } from "../colors/spec.ts";
import type { LightColor } from "../colors/types.ts";

export interface PresetItem {
    spec: LightColor;
    hex: string;
}

export function presetItems(specs: unknown): PresetItem[] {
    const source = toList(specs);
    const items: PresetItem[] = [];
    if (!source)
        return items;

    for (let i = 0; i < source.length; ++i) {
        const spec = normalize(source[i]);
        if (!spec)
            continue;
        items.push({ spec: spec, hex: specToHex(spec) });
    }
    return items;
}

/** Parses the locally stored "#rrggbb" list, dropping invalid entries. */
export function specsFromHex(list: unknown): LightColor[] {
    const source = toList(list) || [];
    const result: LightColor[] = [];
    for (let i = 0; i < source.length; ++i) {
        const spec = fromHex(source[i]);
        if (spec)
            result.push(spec);
    }
    return result;
}

// The lamp's current color, or the wheel position for a colored lamp without one.
export function currentSpecForSync(
    currentSpec: unknown,
    supportsColor: boolean,
    hue01: number,
    saturation01: number,
): LightColor | null {
    let spec = currentSpec;
    if (!spec && supportsColor)
        spec = hsColor(hue01 * 360, saturation01 * 100);
    return normalize(spec);
}

/** The "#rrggbb" mirror of a preset list; invalid entries are skipped. */
export function presetHexes(specs: unknown): string[] {
    const source = toList(specs) || [];
    const hexes: string[] = [];
    for (let i = 0; i < source.length; ++i) {
        const hex = specToHex(source[i]);
        if (hex)
            hexes.push(hex);
    }
    return hexes;
}

export function hasPreset(specs: unknown, spec: unknown): boolean {
    return contains(specs, spec);
}

// Index of the saved "#rrggbb" entry behind a displayed color; -1 when none.
export function indexOfHexSpec(localPresets: unknown, spec: unknown): number {
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

export function sameStringList(first: unknown, second: unknown): boolean {
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
