import assert from "node:assert/strict";
import test from "node:test";

import { hsColor } from "../colors/convert.ts";
import { specToHex } from "../colors/hex.ts";
import {
    currentSpecForSync,
    hasPreset,
    indexOfHexSpec,
    presetHexes,
    presetItems,
    sameStringList,
    specsFromHex,
} from "./list.ts";

test("presetItems normalizes every spec and adds its swatch color", () => {
    const items = presetItems([
        { hs_color: [180, 50] },
        null,
        { rgb_color: [255, 0, 0] },
        { unknown: true },
        { rgb_color: [1, 2] },
    ]);
    assert.deepEqual(items, [
        { spec: { hs_color: [180, 50] }, hex: specToHex({ hs_color: [180, 50] }) },
        { spec: { rgb_color: [255, 0, 0] }, hex: "#ff0000" },
    ]);
});

test("presetItems returns an empty list for missing or non-list input", () => {
    assert.deepEqual(presetItems(null), []);
    assert.deepEqual(presetItems(undefined), []);
    assert.deepEqual(presetItems("junk"), []);
});

test("presetItems accepts array-like lists from QML", () => {
    const items = presetItems({ length: 1, 0: { rgb_color: [0, 255, 0] } });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.hex, "#00ff00");
});

test("specsFromHex parses the given list and drops invalid entries", () => {
    assert.deepEqual(specsFromHex(["#ff0000", "junk", "#00ff00"]), [
        { rgb_color: [255, 0, 0] },
        { rgb_color: [0, 255, 0] },
    ]);
    assert.deepEqual(specsFromHex(["#abc"]), [{ rgb_color: [170, 187, 204] }]);
});

test("specsFromHex only reads the list it is given", () => {
    assert.deepEqual(specsFromHex(undefined), []);
    assert.deepEqual(specsFromHex(null), []);
    assert.deepEqual(specsFromHex({ length: 1, 0: "#ff0000" }), [{ rgb_color: [255, 0, 0] }]);
});

test("presetHexes mirrors the list and skips invalid entries", () => {
    assert.deepEqual(
        presetHexes([{ hs_color: [180, 50] }, null, { rgb_color: [255, 0, 0] }]),
        [specToHex({ hs_color: [180, 50] }), "#ff0000"],
    );
    assert.deepEqual(presetHexes(null), []);
    assert.deepEqual(presetHexes(undefined), []);
    assert.deepEqual(presetHexes({ length: 1, 0: { rgb_color: [0, 255, 0] } }), ["#00ff00"]);
});

test("currentSpecForSync keeps the current color and falls back to the wheel", () => {
    assert.deepEqual(currentSpecForSync({ hs_color: [180, 50] }, false, 0, 0), { hs_color: [180, 50] });
    assert.deepEqual(currentSpecForSync(null, true, 0.5, 1), hsColor(180, 100));
    assert.equal(currentSpecForSync(null, false, 0.5, 1), null);
    // An invalid current spec is normalized away, it does not use the fallback.
    assert.equal(currentSpecForSync({ unknown: true }, true, 0.5, 1), null);
});

test("hasPreset compares by canonical color", () => {
    const specs = [{ hs_color: [180, 50] }, { rgb_color: [255, 0, 0] }];
    assert.equal(hasPreset(specs, { hs_color: [180.2, 50.1] }), true);
    assert.equal(hasPreset(specs, { rgb_color: [0, 255, 0] }), false);
    assert.equal(hasPreset(null, { rgb_color: [255, 0, 0] }), false);
});

test("indexOfHexSpec finds the saved entry behind a displayed color", () => {
    const saved = ["#ff0000", "junk", "#00ff00"];
    // The invalid entry shifts the row index: the second swatch is saved at 2.
    assert.equal(indexOfHexSpec(saved, { rgb_color: [0, 255, 0] }), 2);
    // A displayed hex swatch is an rgb spec, never an hs one.
    assert.equal(indexOfHexSpec(saved, { rgb_color: [255, 0, 0] }), 0);
    assert.equal(indexOfHexSpec(saved, { hs_color: [0, 100] }), -1);
    assert.equal(indexOfHexSpec(saved, { rgb_color: [0, 0, 255] }), -1);
    assert.equal(indexOfHexSpec(null, { rgb_color: [0, 0, 255] }), -1);
    assert.equal(indexOfHexSpec([], { rgb_color: [0, 0, 255] }), -1);
});

test("sameStringList compares element-wise", () => {
    assert.equal(sameStringList(["#ff0000", "#00ff00"], ["#ff0000", "#00ff00"]), true);
    assert.equal(sameStringList([], []), true);
    assert.equal(sameStringList(["#ff0000"], ["#00ff00"]), false);
    assert.equal(sameStringList(["#ff0000"], []), false);
    assert.equal(sameStringList(null, []), false);
    assert.equal(sameStringList([], undefined), false);
    assert.equal(sameStringList({ length: 1, 0: "a" }, ["a"]), true);
});
