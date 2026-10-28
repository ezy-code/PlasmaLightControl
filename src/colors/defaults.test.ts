import assert from "node:assert/strict";
import test from "node:test";

import { asJson, fixtureRows } from "../test-support/fixtures.test-util.ts";
import { computeDefaults } from "./defaults.ts";

test("computeDefaults matches the previous implementation", () => {
    for (const row of fixtureRows("computeDefaults")) {
        const expected = row[row.length - 1];
        assert.deepEqual(asJson(computeDefaults(row[0])), expected, JSON.stringify(row[0]));
    }
});

test("color_temp lamps get four evenly spaced kelvin values", () => {
    const defaults = computeDefaults({
        attributes: {
            supported_color_modes: ["color_temp"],
            min_color_temp_kelvin: 2700,
            max_color_temp_kelvin: 6500,
        },
    });
    assert.deepEqual(defaults, [
        { color_temp_kelvin: 2700 },
        { color_temp_kelvin: 3967 },
        { color_temp_kelvin: 5233 },
        { color_temp_kelvin: 6500 },
    ]);
});

test("colored lamps without color_temp get rgb approximations and fixed colors", () => {
    const defaults = computeDefaults({ attributes: { supported_color_modes: ["hs"] } });
    assert.equal(defaults.length, 8);
    assert.deepEqual(defaults.slice(4), [
        { rgb_color: [127, 172, 255] },
        { rgb_color: [215, 150, 255] },
        { rgb_color: [255, 158, 243] },
        { rgb_color: [255, 110, 84] },
    ]);
});

test("onoff lamps have no default colors", () => {
    assert.deepEqual(computeDefaults({ attributes: { supported_color_modes: ["onoff"] } }), []);
});
