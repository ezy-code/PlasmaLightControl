import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PANEL_TEXT_KEYS } from "./textKeys.ts";

const qml = readFileSync(new URL("../../package/contents/ui/PanelTexts.qml", import.meta.url), "utf8");
const qmlKeys = [...qml.matchAll(/case "([A-Za-z]+)":/g)].map((match) => String(match[1]));
const keys: readonly string[] = PANEL_TEXT_KEYS;

test("every panel text key has a PanelTexts.qml case", () => {
    assert.deepEqual(keys.filter((key) => !qmlKeys.includes(key)), []);
});

test("every PanelTexts.qml case has a panel text key", () => {
    assert.deepEqual(qmlKeys.filter((key) => !keys.includes(key)), []);
});
