import assert from "node:assert/strict";
import test from "node:test";

import {
    cleanMeta,
    decodeMeta,
    decodePresets,
    encodeMeta,
    encodePresets,
    isCorruptJson,
    legacySpecs,
    localMeta,
} from "./cache.ts";

function quietly<T>(run: () => T): T {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        return run();
    } finally {
        console.warn = originalWarn;
    }
}

test("localMeta is the version 1 meta of a locally saved list", () => {
    assert.deepEqual(localMeta(), {
        v: 1,
        source: "",
        origin: "local",
        modifiedAt: 0,
        syncedAt: 0,
    });
});

test("cleanMeta fills in every missing field", () => {
    assert.deepEqual(cleanMeta(null, "http://ha|light.a", 1000), {
        v: 1,
        source: "http://ha|light.a",
        origin: "custom",
        modifiedAt: 0,
        syncedAt: 1000,
    });
    assert.deepEqual(cleanMeta(undefined, "", 7), {
        v: 1,
        source: "",
        origin: "custom",
        modifiedAt: 0,
        syncedAt: 7,
    });
    assert.deepEqual(cleanMeta("junk", "src", 7), {
        v: 1,
        source: "src",
        origin: "custom",
        modifiedAt: 0,
        syncedAt: 7,
    });
});

test("cleanMeta keeps known values and replaces unknown ones", () => {
    assert.deepEqual(
        cleanMeta({ v: 2, source: "kept", origin: "defaults", modifiedAt: "5", syncedAt: 42 }, "fallback", 1000),
        { v: 1, source: "kept", origin: "defaults", modifiedAt: 5, syncedAt: 42 },
    );
    // An empty source means "this lamp", so it falls back to the current source.
    assert.deepEqual(
        cleanMeta({ source: "", origin: "bogus", modifiedAt: 0, syncedAt: 0 }, "current", 1000),
        { v: 1, source: "current", origin: "custom", modifiedAt: 0, syncedAt: 1000 },
    );
    for (const origin of ["custom", "defaults", "empty", "local"]) {
        assert.equal(cleanMeta({ origin: origin }, "", 0).origin, origin);
    }
});

test("encodePresets normalizes the list before writing it", () => {
    const json = quietly(() => encodePresets([{ hs_color: [180, 50.126] }, null, { rgb_color: [1, 2, 3] }]));
    assert.equal(json, '[{"hs_color":[180,50.13]},{"rgb_color":[1,2,3]}]');
    assert.equal(encodePresets(null), "[]");
});

test("encodeMeta and decodeMeta round-trip", () => {
    const meta = { v: 1 as const, source: "http://ha|light.a", origin: "custom" as const, modifiedAt: 3, syncedAt: 4 };
    assert.equal(encodeMeta(meta), JSON.stringify(meta));
    assert.deepEqual(decodeMeta(encodeMeta(meta)), meta);
});

test("decodeMeta rejects anything that is not a version 1 object", () => {
    assert.equal(decodeMeta("{}"), null);
    assert.equal(decodeMeta('{"v":2,"source":"a"}'), null);
    assert.equal(decodeMeta('{"v":1}'), null);
    assert.equal(decodeMeta('{"v":1,"source":7}'), null);
    assert.equal(decodeMeta("[]"), null);
    assert.equal(decodeMeta("null"), null);
});

test("decodeMeta returns null for a corrupt cache instead of throwing", () => {
    assert.equal(decodeMeta("junk"), null);
    assert.equal(decodeMeta('{"v":1,'), null);
    assert.equal(decodeMeta(""), null);
    assert.equal(decodeMeta(undefined), null);
});

test("decodeMeta repairs unknown fields like cleanMeta does", () => {
    assert.deepEqual(decodeMeta('{"v":1,"source":"a|b","origin":"weird","modifiedAt":"8"}'), {
        v: 1,
        source: "a|b",
        origin: "custom",
        modifiedAt: 8,
        syncedAt: 0,
    });
});

test("decodePresets requires the meta of the expected source", () => {
    const meta = { v: 1 as const, source: "http://ha|light.a", origin: "custom" as const, modifiedAt: 0, syncedAt: 0 };
    const json = '[{"hs_color":[180,50]},{"rgb_color":[255,0,0]}]';
    assert.deepEqual(decodePresets(json, meta, "http://ha|light.a"), [
        { hs_color: [180, 50] },
        { rgb_color: [255, 0, 0] },
    ]);
    // Another entity's cache must never be shown under the new source.
    assert.equal(decodePresets(json, meta, "http://ha|light.b"), null);
    assert.equal(decodePresets(json, null, "http://ha|light.a"), null);
});

test("decodePresets rejects payloads that are not a list", () => {
    const meta = { v: 1 as const, source: "s", origin: "custom" as const, modifiedAt: 0, syncedAt: 0 };
    assert.equal(decodePresets('{"hs_color":[180,50]}', meta, "s"), null);
    assert.equal(decodePresets("null", meta, "s"), null);
});

test("decodePresets returns null for a corrupt cache instead of throwing", () => {
    const meta = { v: 1 as const, source: "s", origin: "custom" as const, modifiedAt: 0, syncedAt: 0 };
    assert.equal(decodePresets("junk", meta, "s"), null);
    assert.equal(decodePresets("[{", meta, "s"), null);
    assert.equal(decodePresets(undefined, meta, "s"), null);
    // The source check happens before the payload is even parsed.
    assert.equal(decodePresets("junk", meta, "other"), null);
    assert.equal(decodePresets("junk", null, "s"), null);
});

test("isCorruptJson separates a corrupt cache from an empty or foreign one", () => {
    assert.equal(isCorruptJson("{"), true);
    assert.equal(isCorruptJson(""), true);
    assert.equal(isCorruptJson(undefined), true);
    // Valid JSON that decodeMeta simply rejects must not be reported as corrupt.
    assert.equal(isCorruptJson("{}"), false);
    assert.equal(isCorruptJson("[]"), false);
    assert.equal(isCorruptJson("null"), false);
});

test("legacySpecs migrates the saved hex list", () => {
    assert.deepEqual(legacySpecs(["#ff0000", "junk", "#00ff00"]), [
        { rgb_color: [255, 0, 0] },
        { rgb_color: [0, 255, 0] },
    ]);
    assert.deepEqual(legacySpecs(undefined), []);
});
