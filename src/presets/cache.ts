import { isList } from "../colors/convert.ts";
import { normalizeList } from "../colors/spec.ts";
import type { LightColor } from "../colors/types.ts";
import { specsFromHex } from "./list.ts";

export type CacheOrigin = "custom" | "defaults" | "empty" | "local";

export interface CacheMeta {
    v: 1;
    source: string;
    origin: CacheOrigin;
    modifiedAt: number;
    syncedAt: number;
}

const ALLOWED_ORIGINS = ["custom", "defaults", "empty", "local"];

function isAllowedOrigin(value: unknown): value is CacheOrigin {
    return typeof value === "string" && ALLOWED_ORIGINS.indexOf(value) >= 0;
}

function field(source: unknown, key: string): unknown {
    if (!source || typeof source !== "object")
        return undefined;
    return (source as Record<string, unknown>)[key];
}

/** The meta written for a locally saved (not synchronized) preset list. */
export function localMeta(): CacheMeta {
    return { v: 1, source: "", origin: "local", modifiedAt: 0, syncedAt: 0 };
}

/** Fills in missing meta fields; an unknown origin becomes "custom". */
export function cleanMeta(meta: unknown, defaultSource: unknown, nowSeconds: number): CacheMeta {
    const source = field(meta, "source");
    const origin = field(meta, "origin");
    return {
        v: 1,
        source: (typeof source === "string" ? source : "") || String(defaultSource || ""),
        origin: isAllowedOrigin(origin) ? origin : "custom",
        modifiedAt: Number(field(meta, "modifiedAt")) || 0,
        syncedAt: Number(field(meta, "syncedAt")) || nowSeconds,
    };
}

export function encodePresets(list: unknown): string {
    return JSON.stringify(normalizeList(list));
}

export function encodeMeta(meta: CacheMeta): string {
    return JSON.stringify(meta);
}

// A corrupt cache must never break the widget: every decode returns null.
function parseJson(text: unknown): unknown {
    if (typeof text !== "string")
        return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** True when the stored text is not parseable JSON at all (a corrupt cache). */
export function isCorruptJson(text: unknown): boolean {
    return parseJson(text) === undefined;
}

/** Parses the stored meta; null when it is not a version 1 object. */
export function decodeMeta(json: unknown): CacheMeta | null {
    const raw = parseJson(json);
    if (!raw || typeof raw !== "object" || isList(raw))
        return null;

    const record = raw as Record<string, unknown>;
    if (record.v !== 1 || typeof record.source !== "string")
        return null;

    return {
        v: 1,
        source: record.source,
        origin: isAllowedOrigin(record.origin) ? record.origin : "custom",
        modifiedAt: Number(record.modifiedAt) || 0,
        syncedAt: Number(record.syncedAt) || 0,
    };
}

/** Null when the cache belongs to another source or the payload is not a list. */
export function decodePresets(json: unknown, meta: CacheMeta | null, expectedSource: unknown): LightColor[] | null {
    if (!meta || meta.source !== expectedSource)
        return null;

    const raw = parseJson(json);
    if (!Array.isArray(raw))
        return null;
    return normalizeList(raw);
}

/** The legacy migration reads the same "#rrggbb" list the local mirror uses. */
export function legacySpecs(localPresets: unknown): LightColor[] {
    return specsFromHex(localPresets);
}
