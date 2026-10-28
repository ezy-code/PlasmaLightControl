import assert from "node:assert/strict";
import test from "node:test";

import { sourceKey } from "./sourceKey.ts";

test("sourceKey trims the URL and strips trailing slashes", () => {
    assert.equal(sourceKey("http://ha:8123/", " light.x "), "http://ha:8123|light.x");
});

test("sourceKey strips every trailing slash", () => {
    assert.equal(sourceKey("https://ha.example.com///", "light.kitchen"), "https://ha.example.com|light.kitchen");
});

test("sourceKey keeps an empty side empty", () => {
    assert.equal(sourceKey("", ""), "|");
    assert.equal(sourceKey(null, undefined), "|");
});

test("sourceKey coerces non-string values", () => {
    assert.equal(sourceKey(42, 7), "42|7");
});
