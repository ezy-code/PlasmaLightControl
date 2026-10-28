import assert from "node:assert/strict";
import test from "node:test";

import { hsColor, rgbToHs, xyToHs } from "../colors/convert.ts";
import { specToHex, specToRgb } from "../colors/hex.ts";
import {
    currentColorSpec,
    hexFromHs,
    hs01FromSpec,
    neutralLampState,
    parseLampState,
} from "./lampState.ts";

const noFallback = { supportsColor: false, hue01: 0, saturation01: 0 };

test("currentColorSpec follows the color_mode priority", () => {
    const attributes = {
        color_mode: "rgbww",
        color_temp_kelvin: 2700,
        rgbww_color: [255, 0, 0, 0, 0],
        rgbw_color: [255, 0, 0, 0],
        rgb_color: [255, 0, 0],
        hs_color: [0, 100],
        xy_color: [0.7, 0.3],
    };
    assert.deepEqual(currentColorSpec(attributes, noFallback), { rgbww_color: [255, 0, 0, 0, 0] });
    assert.deepEqual(
        currentColorSpec({ ...attributes, color_mode: "rgbw" }, noFallback),
        { rgbw_color: [255, 0, 0, 0] },
    );
    assert.deepEqual(
        currentColorSpec({ ...attributes, color_mode: "rgb" }, noFallback),
        { rgb_color: [255, 0, 0] },
    );
    assert.deepEqual(
        currentColorSpec({ ...attributes, color_mode: "hs" }, noFallback),
        { hs_color: [0, 100] },
    );
    assert.deepEqual(
        currentColorSpec({ ...attributes, color_mode: "color_temp" }, noFallback),
        { color_temp_kelvin: 2700 },
    );
});

test("currentColorSpec rejects a mode whose channel array has the wrong length", () => {
    const attributes = { color_mode: "rgbw", rgbw_color: [1, 2, 3], rgb_color: [10, 20, 30] };
    assert.deepEqual(currentColorSpec(attributes, noFallback), { rgb_color: [10, 20, 30] });
});

test("currentColorSpec converts xy through xyToHs and prefers hs_color", () => {
    const xyOnly = currentColorSpec({ color_mode: "xy", xy_color: [0.3, 0.3] }, noFallback);
    assert.deepEqual(xyOnly, { hs_color: xyToHs([0.3, 0.3]) });
    assert.deepEqual(
        currentColorSpec({ color_mode: "xy", xy_color: [0.3, 0.3], hs_color: [180, 50] }, noFallback),
        { hs_color: [180, 50] },
    );
    // y <= 0 makes the xy conversion impossible, so nothing is derived.
    assert.equal(currentColorSpec({ color_mode: "xy", xy_color: [0.3, 0] }, noFallback), null);
});

test("currentColorSpec falls back to the wheel only for a colored lamp", () => {
    const fallback = { supportsColor: true, hue01: 0.5, saturation01: 1 };
    assert.deepEqual(currentColorSpec({}, fallback), hsColor(180, 100));
    assert.deepEqual(currentColorSpec({}, noFallback), null);
    assert.deepEqual(
        currentColorSpec({ rgbw_color: [1, 2, 3, 4] }, fallback),
        { rgbw_color: [1, 2, 3, 4] },
    );
});

test("parseLampState rejects a missing payload or a missing state field", () => {
    assert.equal(parseLampState(null, "light.a", noFallback), null);
    assert.equal(parseLampState(undefined, "light.a", noFallback), null);
    assert.equal(parseLampState({}, "light.a", noFallback), null);
    assert.equal(parseLampState({ attributes: {} }, "light.a", noFallback), null);
});

test("parseLampState derives availability, name and brightness", () => {
    const parsed = parseLampState(
        { state: "on", attributes: { friendly_name: "Kitchen", brightness: 128 } },
        "light.kitchen",
        noFallback,
    );
    assert.ok(parsed);
    assert.equal(parsed.available, true);
    assert.equal(parsed.lightOn, true);
    assert.equal(parsed.displayName, "Kitchen");
    assert.equal(parsed.brightness, 128);

    const unnamed = parseLampState({ state: "off", attributes: {} }, "light.kitchen", noFallback);
    assert.ok(unnamed);
    assert.equal(unnamed.lightOn, false);
    assert.equal(unnamed.displayName, "light.kitchen");
    assert.equal(unnamed.brightness, undefined);
});

test("parseLampState treats unavailable and unknown as not available", () => {
    for (const state of ["unavailable", "unknown"]) {
        const parsed = parseLampState({ state: state, attributes: {} }, "light.a", noFallback);
        assert.ok(parsed);
        assert.equal(parsed.available, false);
        assert.equal(parsed.lightOn, false);
    }
});

test("parseLampState keeps a null brightness out of the result", () => {
    const parsed = parseLampState({ state: "on", attributes: { brightness: null } }, "light.a", noFallback);
    assert.ok(parsed);
    assert.equal(parsed.brightness, undefined);
});

test("parseLampState derives capabilities, kelvin bounds and effects", () => {
    const parsed = parseLampState({
        state: "on",
        attributes: {
            supported_color_modes: ["color_temp", "hs"],
            min_color_temp_kelvin: 2000,
            max_color_temp_kelvin: 6500,
            color_temp_kelvin: 2700,
            effect_list: ["rainbow"],
            effect: "rainbow",
        },
    }, "light.a", noFallback);
    assert.ok(parsed);
    assert.deepEqual(parsed.supportedColorModes, ["color_temp", "hs"]);
    assert.equal(parsed.supportsColor, true);
    assert.equal(parsed.supportsColorTemp, true);
    assert.equal(parsed.minKelvin, 2000);
    assert.equal(parsed.maxKelvin, 6500);
    assert.equal(parsed.colorTempKelvin, 2700);
    assert.deepEqual(parsed.effectList, ["rainbow"]);
    assert.equal(parsed.currentEffect, "rainbow");
});

test("parseLampState drops zero and missing optional attributes", () => {
    const parsed = parseLampState({
        state: "on",
        attributes: { min_color_temp_kelvin: 0, effect_list: [], effect: 7 },
    }, "light.a", noFallback);
    assert.ok(parsed);
    assert.equal(parsed.minKelvin, undefined);
    assert.equal(parsed.maxKelvin, undefined);
    assert.equal(parsed.colorTempKelvin, undefined);
    assert.equal(parsed.currentEffect, undefined);
    assert.deepEqual(parsed.effectList, []);
    assert.equal(parsed.supportsColor, false);
});

test("parseLampState prefers hs_color over rgb_color for the wheel", () => {
    const parsed = parseLampState({
        state: "on",
        attributes: { hs_color: [180, 50], rgb_color: [255, 0, 0] },
    }, "light.a", noFallback);
    assert.ok(parsed);
    assert.equal(parsed.hue01, 0.5);
    assert.equal(parsed.saturation01, 0.5);
});

// Replaces Qt.rgba().hsvHue/hsvSaturation: same HSV, saturation in percent.
test("parseLampState converts rgb_color like Qt.rgba().hsvHue/hsvSaturation", () => {
    const samples: Array<[number[], number, number]> = [
        [[255, 0, 0], 0, 1],
        [[0, 255, 0], 1 / 3, 1],
        [[0, 0, 255], 2 / 3, 1],
        [[128, 128, 128], 0, 0],
        [[255, 255, 0], 1 / 6, 1],
        [[64, 128, 192], 210 / 360, 2 / 3],
    ];
    // rgbToHs() rounds to two decimals, so allow ~1e-4 of difference.
    const tolerance = 1e-4;
    for (const [rgb, hue01, saturation01] of samples) {
        const parsed = parseLampState({ state: "on", attributes: { rgb_color: rgb } }, "light.a", noFallback);
        assert.ok(parsed, `rgb ${rgb}`);
        assert.ok(Math.abs((parsed.hue01 ?? 0) - hue01) < tolerance, `hue ${rgb} -> ${parsed.hue01}`);
        assert.ok(
            Math.abs((parsed.saturation01 ?? 0) - saturation01) < tolerance,
            `saturation ${rgb} -> ${parsed.saturation01}`,
        );
        const hs = rgbToHs(rgb);
        assert.ok(hs);
        assert.ok(Math.abs(hs[0] / 360 - hue01) < tolerance);
        assert.ok(Math.abs(hs[1] / 100 - saturation01) < tolerance);
    }
});

test("parseLampState uses the previous wheel position as the color fallback", () => {
    // main.qml passes the wheel position from *before* this state arrived.
    const state = { state: "on", attributes: { supported_color_modes: ["hs"] } };
    const before = parseLampState(state, "light.a", { supportsColor: false, hue01: 0.25, saturation01: 0.5 });
    const after = parseLampState(state, "light.a", { supportsColor: false, hue01: 0.75, saturation01: 1 });
    assert.ok(before && after);
    assert.deepEqual(before.currentColorSpec, hsColor(90, 50));
    assert.deepEqual(after.currentColorSpec, hsColor(270, 100));
    assert.notDeepEqual(before.currentColorSpec, after.currentColorSpec);
    // The payload carries no color, so the wheel properties stay untouched.
    assert.equal(before.hue01, undefined);
    assert.equal(before.saturation01, undefined);

    // A color reported by the lamp always wins over the fallback.
    const withColor = parseLampState(
        { state: "on", attributes: { hs_color: [180, 50] } },
        "light.a",
        { supportsColor: true, hue01: 0.25, saturation01: 0.5 },
    );
    assert.ok(withColor);
    assert.deepEqual(withColor.currentColorSpec, { hs_color: [180, 50] });
});

test("neutralLampState resets every lamp value and leaves the name alone", () => {
    const neutral = neutralLampState();
    assert.deepEqual(neutral, {
        available: true,
        lightOn: false,
        brightness: 0,
        supportsColor: false,
        supportsColorTemp: false,
        supportedColorModes: [],
        currentColorSpec: null,
        effectList: [],
        currentEffect: "",
        minKelvin: 2000,
        maxKelvin: 6500,
        colorTempKelvin: 3500,
        hue01: 0,
        saturation01: 0,
    });
    // resetLampState() must not overwrite displayName.
    assert.equal("displayName" in neutral, false);
    const parsed = parseLampState({ state: "on", attributes: {} }, "light.a", noFallback);
    assert.ok(parsed);
    for (const key of [
        "available", "lightOn", "supportsColor", "supportsColorTemp",
        "supportedColorModes", "currentColorSpec", "effectList",
    ])
        assert.ok(key in neutral && key in parsed, key);
    // A reset must carry every optional attribute, never the previous lamp's value.
    for (const key of [
        "brightness", "currentEffect", "minKelvin", "maxKelvin",
        "colorTempKelvin", "hue01", "saturation01",
    ])
        assert.ok(key in neutral, key);
});

test("hs01FromSpec matches the specToRgb/rgbToHs conversion", () => {
    const samples: unknown[] = [
        { rgb_color: [255, 0, 0] },
        { rgb_color: [0, 0, 255] },
        { color_temp_kelvin: 2700 },
        { rgbw_color: [255, 0, 0, 0] },
        { rgbww_color: [255, 0, 0, 0, 0] },
    ];
    for (const spec of samples) {
        const hs = rgbToHs(specToRgb(spec));
        const converted = hs01FromSpec(spec);
        assert.ok(converted, JSON.stringify(spec));
        assert.ok(hs, JSON.stringify(spec));
        assert.equal(converted.hue01, hs[0] / 360);
        assert.equal(converted.saturation01, hs[1] / 100);
    }
    assert.equal(hs01FromSpec(null), null);
    assert.equal(hs01FromSpec({ rgb_color: [1, 2] }), null);
});

test("hexFromHs matches hsColor plus specToHex", () => {
    assert.equal(hexFromHs(0.5, 1), "#00ffff");
    assert.equal(hexFromHs(0, 1), "#ff0000");
    assert.equal(hexFromHs(1 / 3, 1), "#00ff00");
    assert.equal(hexFromHs(0, 0), "#ffffff");
    for (const [hue01, saturation01] of [[0.1, 0.2], [0.75, 0.6], [0.999, 1]] as Array<[number, number]>) {
        assert.equal(hexFromHs(hue01, saturation01), specToHex(hsColor(hue01 * 360, saturation01 * 100)));
    }
});
