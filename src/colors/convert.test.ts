import assert from "node:assert/strict";
import test from "node:test";

import { cases, fixtureRows } from "../test-support/fixtures.test-util.ts";
import {
    clamp,
    hsColor,
    hsToRgb,
    kelvin2mired,
    matchMaxScale,
    mired2kelvin,
    rgbToHs,
    rgbwToRgb,
    rgbwwToRgb,
    round2,
    roundHs,
    temperature2rgb,
    xyToHs,
} from "./convert.ts";
import type { RgbwColor, RgbwwColor } from "./types.ts";

test("numeric helpers match the previous implementation", () => {
    cases("clamp", (row) => clamp(row[0] as number, row[1] as number, row[2] as number));
    cases("round2", (row) => round2(row[0] as number));
    cases("matchMaxScale", (row) => matchMaxScale(row[0] as number[], row[1] as number[]));
});

test("roundHs and hsColor apply the shared hs rounding rule", () => {
    for (const row of fixtureRows("roundHs")) {
        const [hue, saturation, expected, colorSpec] = row as [number, number, unknown, unknown];
        assert.deepEqual(roundHs(hue, saturation), expected);
        assert.deepEqual(hsColor(hue, saturation), colorSpec);
    }
});

test("temperature, hsl/rgb/xy conversions match the previous implementation", () => {
    cases("temperature2rgb", (row) => temperature2rgb(row[0] as number));
    cases("hsToRgb", (row) => hsToRgb(row[0]));
    cases("rgbToHs", (row) => rgbToHs(row[0]));
    cases("xyToHs", (row) => xyToHs(row[0]));
    cases("kelvin2mired", (row) => kelvin2mired(row[0] as number));
    cases("mired2kelvin", (row) => mired2kelvin(row[0] as number));
    // Fixture rows include short/long channel arrays: no length validation happens.
    cases("rgbwToRgb", (row) => rgbwToRgb(row[0] as RgbwColor));
    cases("rgbwwToRgb", (row) => rgbwwToRgb(row[0] as RgbwwColor));
});

test("hs round-trip stays within rounding tolerance", () => {
    const samples: Array<[number, number]> = [
        [0, 100], [30, 80], [120, 60], [180, 50], [240, 100], [300, 75], [359, 90],
    ];
    for (const [hue, saturation] of samples) {
        const rgb = hsToRgb([hue, saturation]);
        assert.ok(rgb, `hsToRgb(${hue}, ${saturation})`);
        const back = rgbToHs(rgb);
        assert.ok(back, `rgbToHs for ${hue}, ${saturation}`);
        const hueDelta = Math.min(Math.abs(back[0] - hue), 360 - Math.abs(back[0] - hue));
        assert.ok(hueDelta <= 1.5, `hue ${hue} -> ${back[0]}`);
        assert.ok(Math.abs(back[1] - saturation) <= 1.5, `saturation ${saturation} -> ${back[1]}`);
    }
});

test("temperature2rgb matches reference values", () => {
    assert.deepEqual(temperature2rgb(2700), [255, 167, 87]);
    assert.deepEqual(temperature2rgb(6500), [255, 254, 250]);
});

test("xyToHs rejects a black or invalid point", () => {
    assert.equal(xyToHs([0.5, 0]), null);
    assert.equal(xyToHs([0.3, Number.POSITIVE_INFINITY]), null);
    assert.equal(xyToHs([0.3]), null);
});
