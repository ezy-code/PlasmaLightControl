import assert from "node:assert/strict";
import test from "node:test";

import { wheelStep } from "./controlMath.ts";

test("wheelStep moves brightness by five percent per notch", () => {
    assert.deepEqual(wheelStep(100, 0, 120, 5, 0, 255), { value: 112, pending: 0 });
    assert.deepEqual(wheelStep(100, 0, -120, 5, 0, 255), { value: 87, pending: 0 });
});

test("wheelStep consumes several notches from one event", () => {
    assert.deepEqual(wheelStep(100, 0, 240, 5, 0, 255), { value: 125, pending: 0 });
    assert.deepEqual(wheelStep(100, 0, -360, 5, 0, 255), { value: 61, pending: 0 });
});

test("wheelStep keeps deltas below one notch for the next event", () => {
    assert.deepEqual(wheelStep(100, 0, 60, 5, 0, 255), { value: null, pending: 60 });
    assert.deepEqual(wheelStep(100, 60, 60, 5, 0, 255), { value: 112, pending: 0 });
    assert.deepEqual(wheelStep(100, 0, -90, 5, 0, 255), { value: null, pending: -90 });
    assert.deepEqual(wheelStep(100, -90, -30, 5, 0, 255), { value: 87, pending: 0 });
});

test("wheelStep reports no change at the ends of the range", () => {
    assert.deepEqual(wheelStep(255, 0, 120, 5, 0, 255), { value: null, pending: 0 });
    assert.deepEqual(wheelStep(0, 0, -120, 5, 0, 255), { value: null, pending: 0 });
});

test("wheelStep steps a kelvin range by a percent of that range", () => {
    assert.deepEqual(wheelStep(3000, 0, 120, 5, 2000, 6500), { value: 3215, pending: 0 });
});

test("wheelStep ignores a collapsed range", () => {
    assert.deepEqual(wheelStep(2700, 0, 120, 5, 2700, 2700), { value: null, pending: 0 });
});
