import assert from "node:assert/strict";
import test from "node:test";

import { cases } from "../test-support/fixtures.test-util.ts";
import { fromHex, rgbToHex, specToHex, specToRgb } from "./hex.ts";

test("fromHex accepts the previous hex formats", () => {
    cases("fromHex", (row) => fromHex(row[0]));
});

test("rgbToHex matches the previous implementation", () => {
    cases("rgbToHex", (row) => rgbToHex(row[0]));
});

test("specToRgb and specToHex match the previous implementation", () => {
    cases("specToRgb", (row) => specToRgb(row[0]));
    cases("specToHex", (row) => specToHex(row[0]));
});

test("fromHex expands short form and ignores alpha", () => {
    assert.deepEqual(fromHex("#abc"), { rgb_color: [170, 187, 204] });
    assert.deepEqual(fromHex("#11223344"), { rgb_color: [17, 34, 51] });
    assert.deepEqual(fromHex(" 780 "), { rgb_color: [119, 136, 0] });
});

test("fromHex rejects malformed values", () => {
    assert.equal(fromHex("#12345"), null);
    assert.equal(fromHex("red"), null);
    assert.equal(fromHex(""), null);
    assert.equal(fromHex(42), null);
});

test("rgbToHex clamps and rounds components", () => {
    assert.equal(rgbToHex([-5, 300, 127.5]), "#00ff80");
    assert.equal(rgbToHex({ length: 3, 0: 1, 1: 2, 2: 3 }), "#010203");
    assert.equal(rgbToHex([1, 2]), "");
});
