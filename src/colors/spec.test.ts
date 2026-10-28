import assert from "node:assert/strict";
import test from "node:test";

import { cases } from "../test-support/fixtures.test-util.ts";
import {
    applyOps,
    canonical,
    canonicalList,
    contains,
    normalize,
    normalizeList,
} from "./spec.ts";

function quietly<T>(run: () => T): T {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        return run();
    } finally {
        console.warn = originalWarn;
    }
}

// normalizeList inside a fixture case may warn about dropped entries.
function quietCases(name: string, run: (row: unknown[]) => unknown): void {
    quietly(() => cases(name, run));
}

test("normalize and normalizeList match the previous implementation", () => {
    quietCases("normalize", (row) => normalize(row[0]));
    quietCases("normalizeList", (row) => normalizeList(row[0]));
});

test("canonical keys and contains match the previous implementation", () => {
    quietCases("canonical", (row) => canonical(row[0]));
    quietCases("canonicalList", (row) => canonicalList(row[0]));
    quietCases("contains", (row) => contains(row[0], row[1]));
});

test("applyOps matches the previous implementation", () => {
    quietCases("applyOps", (row) => applyOps(row[0], row[1]));
});

test("normalize rejects non-finite and out-of-range kelvin", () => {
    assert.equal(normalize({ color_temp_kelvin: Number.NaN }), null);
    assert.equal(normalize({ color_temp_kelvin: Number.POSITIVE_INFINITY }), null);
    assert.equal(normalize({ color_temp_kelvin: 0 }), null);
    assert.equal(normalize({ color_temp_kelvin: -100 }), null);
});

test("normalize rejects non-finite color components", () => {
    assert.equal(normalize({ hs_color: [Number.NaN, 50] }), null);
    assert.equal(normalize({ rgb_color: [Number.POSITIVE_INFINITY, 1, 2] }), null);
    assert.equal(normalize({ rgbw_color: [1, 2, 3, Number.NaN] }), null);
    assert.equal(normalize({ rgbww_color: [1, 2, 3, 4, Number.NaN] }), null);
});

test("normalize accepts array-like values from QML signals", () => {
    const arrayLike = { length: 2, 0: 180, 1: 50 };
    assert.deepEqual(normalize({ hs_color: arrayLike }), { hs_color: [180, 50] });
});

test("normalize treats hue 360 as an equivalent canonical color", () => {
    assert.equal(canonical({ hs_color: [360, 50] }), canonical({ hs_color: [0, 50] }));
    assert.equal(canonical({ hs_color: [180, 2.88] }), canonical({ hs_color: [180, 3] }));
});

test("normalizeList drops every invalid entry and warns once per entry", () => {
    const originalWarn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings += 1; };
    try {
        const result = normalizeList([{ hs_color: [180, 50] }, null, { rgb_color: [1, 2] }, "bad"]);
        assert.equal(result.length, 1);
        assert.equal(warnings, 3);
    } finally {
        console.warn = originalWarn;
    }
});

test("applyOps is idempotent for repeated adds", () => {
    const spec = { hs_color: [240, 40] } as const;
    const once = applyOps([], [{ type: "add", spec }]);
    const twice = applyOps(once, [{ type: "add", spec }, { type: "add", spec }]);
    assert.deepEqual(twice, once);
});

test("applyOps removes by canonical color, not by identity", () => {
    const list = [{ hs_color: [180, 50] }, { color_temp_kelvin: 2700 }];
    const result = applyOps(list, [{ type: "remove", spec: { hs_color: [180.2, 50.1] } }]);
    assert.deepEqual(result, [{ color_temp_kelvin: 2700 }]);
});
