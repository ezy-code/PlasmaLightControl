import assert from "node:assert/strict";
import test from "node:test";

import { hsColor } from "../colors/convert.ts";
import { specToHex } from "../colors/hex.ts";
import { sourceKey } from "../ha/sourceKey.ts";
import {
    createFakeHost,
    createFakeSyncModule,
} from "../test-support/fake-panel-host.test-util.ts";
import type { FakePanelHost } from "../test-support/fake-panel-host.test-util.ts";
import { createSession, initialSnapshot } from "./session.ts";
import type { PanelSession } from "./session.ts";

const SOURCE = sourceKey("http://ha.test:8123", "light.lamp");

/** A Home Assistant state payload with everything a colored lamp reports. */
function lampState(
    state: Record<string, unknown> = {},
    attributes: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        state: "on",
        attributes: {
            friendly_name: "Lamp",
            supported_color_modes: ["hs", "color_temp"],
            brightness: 128,
            hs_color: [180, 50],
            color_temp_kelvin: 3000,
            min_color_temp_kelvin: 2200,
            max_color_temp_kelvin: 6500,
            effect_list: ["rainbow", "pulse"],
            effect: "rainbow",
            ...attributes,
        },
        ...state,
    };
}

function cacheMeta(source: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        v: 1,
        source: source,
        origin: "custom",
        modifiedAt: 0,
        syncedAt: 1_700_000_000,
        ...extra,
    });
}

function started(fake: FakePanelHost): PanelSession {
    const session = createSession(fake.host);
    session.start();
    return session;
}

/** Feeds one lamp state so the wheel has a color the presets can start from. */
function connectLamp(fake: FakePanelHost, session: PanelSession): void {
    const before = fake.log.requests.length;
    session.refresh();
    fake.log.requests[before]?.succeed(lampState());
}

/** Brings a session into "the sync component is ready and writable" state. */
function synced(session: PanelSession, presets: unknown[]): void {
    session.handlePermissionChanged(true);
    session.handlePresetsPulled(presets, {
        source: SOURCE,
        serverPresets: presets,
        origin: "custom",
    });
    session.handleStatusChanged("synced", "");
}

test("initialSnapshot has the full shape, so every mirrored property starts defined", () => {
    const view = initialSnapshot();
    assert.equal(view.configured, false);
    assert.equal(view.lightOn, false);
    assert.deepEqual(view.presetItems, []);
    assert.equal(view.syncState, "off");
    assert.equal(typeof view.toolTipSubText, "string");
    assert.equal(view.lightAttributes.min_color_temp_kelvin, 2000);
});

test("start migrates the legacy localPresets list into the new cache keys", () => {
    const fake = createFakeHost({ localPresets: ["#ff0000", "#00ff00"] });
    const session = started(fake);

    assert.deepEqual(fake.log.writes.cachedPresetsJson, ['[{"rgb_color":[255,0,0]},{"rgb_color":[0,255,0]}]']);
    assert.deepEqual(fake.log.writes.cachedMetaJson, [
        '{"v":1,"source":"","origin":"local","modifiedAt":0,"syncedAt":0}',
    ]);
    assert.equal(session.snapshot().presetItems.length, 2);
    assert.equal(session.snapshot().syncState, "off");
});

test("start leaves an existing cache alone", () => {
    const fake = createFakeHost({ localPresets: ["#ff0000"], cachedPresetsJson: "[]" });
    started(fake);
    assert.deepEqual(fake.log.writes.cachedPresetsJson, []);
});

test("start loads the cache that belongs to the configured entity", () => {
    const fake = createFakeHost({
        syncPresets: true,
        cachedPresetsJson: '[{"rgb_color":[255,0,0]}]',
        cachedMetaJson: cacheMeta(SOURCE),
    });
    const session = started(fake);
    const view = session.snapshot();

    assert.equal(view.cachedAvailable, true);
    assert.equal(view.syncState, "cached");
    assert.equal(view.syncStatusText, "syncWaiting");
    assert.equal(view.syncHasData, true);
    assert.deepEqual(view.presetItems.map((item) => item.hex), ["#ff0000"]);
});

test("a cache of another entity is not shown and keeps the status connecting", () => {
    const fake = createFakeHost({
        syncPresets: true,
        localPresets: ["#00ff00"],
        cachedPresetsJson: '[{"rgb_color":[255,0,0]}]',
        cachedMetaJson: cacheMeta(sourceKey("http://ha.test:8123", "light.other")),
    });
    const session = started(fake);
    const view = session.snapshot();

    assert.equal(view.cachedAvailable, false);
    assert.equal(view.syncState, "connecting");
    assert.equal(view.syncHasData, false);
    assert.deepEqual(view.presetItems.map((item) => item.hex), ["#00ff00"]);
});

test("an unconfigured widget reports it instead of sending a request", () => {
    const fake = createFakeHost({ url: "" });
    const session = started(fake);
    session.refresh();
    const view = session.snapshot();

    assert.deepEqual(fake.log.requests, []);
    assert.equal(view.statusText, "notConfigured");
    assert.equal(view.connected, false);
    assert.equal(view.toolTipMainText, "light.lamp");
    assert.equal(view.toolTipSubText, "tooltipNotConfigured");
});

test("triggers during an in-flight request coalesce into one follow-up", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.refresh();
    session.refresh();
    assert.equal(fake.log.requests.length, 1);

    fake.log.requests[0]?.succeed(lampState());
    assert.equal(fake.log.later.length, 1);

    fake.flushLater();
    assert.equal(fake.log.requests.length, 2);
});

test("a response of a superseded request is dropped", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.refresh();
    const stale = fake.log.requests[0];
    session.setConfig({
        ...fake.config,
        url: "http://other.test:8123",
    });
    stale?.succeed(lampState());

    assert.equal(session.snapshot().connected, false);
    assert.equal(session.snapshot().displayName, "");
    assert.equal(fake.log.requests.length, 2);
    assert.equal(fake.log.requests[1]?.cfg.url, "http://other.test:8123");
});

test("applyState publishes the lamp capabilities", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.succeed(lampState());
    const view = session.snapshot();

    assert.equal(view.connected, true);
    assert.equal(view.statusText, "");
    assert.equal(view.displayName, "Lamp");
    assert.equal(view.lightOn, true);
    assert.equal(view.brightness, 128);
    assert.equal(view.available, true);
    assert.equal(view.lightStateKnown, true);
    assert.equal(view.supportsColor, true);
    assert.equal(view.supportsColorTemp, true);
    assert.equal(view.supportsEffect, true);
    assert.deepEqual(view.effectList, ["rainbow", "pulse"]);
    assert.equal(view.currentEffect, "rainbow");
    assert.equal(view.hue01, 0.5);
    assert.equal(view.saturation01, 0.5);
    assert.equal(view.minKelvin, 2200);
    assert.deepEqual(view.lightAttributes.supported_color_modes, ["hs", "color_temp"]);
});

test("an unavailable lamp does not publish a known light state", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.succeed(lampState({ state: "unavailable" }));
    const view = session.snapshot();

    assert.equal(view.available, false);
    assert.equal(view.lightStateKnown, false);
    assert.equal(view.lightOn, false);
});

test("an unusable payload still clears the error status", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.succeed({});

    assert.equal(session.snapshot().connected, true);
    assert.equal(session.snapshot().statusText, "");
    assert.equal(session.snapshot().lightStateKnown, false);
});

test("a failing poll surfaces the error text", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.fail({ code: "timeout" });

    assert.equal(session.snapshot().connected, false);
    assert.equal(session.snapshot().statusText, "timeout");
    assert.equal(session.snapshot().toolTipSubText, "timeout\ntooltipHint");
});

test("a new entity drops everything derived from the previous lamp", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.succeed(lampState());

    session.setConfig({ ...fake.config, entityId: "light.other" });
    const view = session.snapshot();

    assert.deepEqual(fake.log.cancels, [{ scope: "scope-test", method: "GET" }]);
    assert.equal(view.brightness, 0);
    assert.equal(view.supportsColor, false);
    assert.equal(view.hue01, 0);
    assert.equal(view.available, true);
    assert.equal(view.lightStateKnown, false);
    assert.equal(fake.log.requests[1]?.cfg.entityId, "light.other");
});

test("a poll interval change refetches without resetting the lamp", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.refresh();
    fake.log.requests[0]?.succeed(lampState());

    session.setConfig({ ...fake.config, pollInterval: 30 });
    assert.equal(session.snapshot().brightness, 128);
    assert.equal(session.snapshot().pollIntervalSeconds, 30);
    assert.equal(session.snapshot().requestTimeout, 15000);
    assert.equal(fake.log.requests.length, 2);
});

test("the request timeout stays below the poll interval", () => {
    const fake = createFakeHost({ pollInterval: 15 });
    const session = started(fake);
    assert.equal(session.snapshot().pollIntervalSeconds, 15);
    assert.equal(session.snapshot().requestTimeout, 14500);

    session.setConfig({ ...fake.config, pollInterval: 1 });
    assert.equal(session.snapshot().pollIntervalSeconds, 3);
    assert.equal(session.snapshot().requestTimeout, 2500);
});

test("toggle is optimistic and restarts the refresh timer", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.toggleLight();

    assert.equal(fake.log.requests[0]?.kind, "toggle");
    assert.equal(session.snapshot().lightOn, false);

    fake.log.requests[0]?.succeed();
    assert.equal(session.snapshot().lightOn, true);
    assert.equal(fake.log.refreshTimerRestarts, 1);
});

test("a failing action keeps the lamp untouched and reports the error", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.setBrightness(64);
    fake.log.requests[0]?.fail({ code: "noConnection" });

    assert.equal(session.snapshot().lightOn, false);
    assert.equal(session.snapshot().statusText, "noConnection");
});

test("brightness is previewed immediately and sent rounded", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.setBrightness(127.6);

    assert.equal(session.snapshot().brightness, 127.6);
    assert.deepEqual(fake.log.requests[0]?.attributes, { brightness: 128 });

    fake.log.requests[0]?.succeed();
    assert.equal(session.snapshot().lightOn, true);
});

test("a state refresh that started before a brightness change is discarded", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.refresh();
    const staleState = fake.log.requests[0];
    assert.equal(staleState?.kind, "fetchState");

    session.setBrightness(128);
    staleState?.succeed(lampState({}, { brightness: 122 }));

    assert.equal(session.snapshot().brightness, 128);
});

test("color, temperature and effect updates carry their attributes", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.setColor(0.5, 0.5);
    assert.deepEqual(fake.log.requests[0]?.attributes, { hs_color: [180, 50] });
    assert.deepEqual(session.snapshot().currentColorSpec, hsColor(180, 50));

    session.setColorTemp(2700.4);
    assert.deepEqual(fake.log.requests[1]?.attributes, { color_temp_kelvin: 2700 });
    assert.deepEqual(session.snapshot().currentColorSpec, { color_temp_kelvin: 2700 });
    assert.equal(session.snapshot().colorTempKelvin, 2700.4);

    session.setEffect("pulse");
    assert.deepEqual(fake.log.requests[2]?.attributes, { effect: "pulse" });
    assert.equal(session.snapshot().currentEffect, "pulse");
});

test("color picks are debounced and only the last one is sent", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.scheduleColor(0.1, 0.2);
    session.scheduleColor(0.3, 0.4);

    assert.deepEqual(fake.log.colorTimerStarts, [200, 200]);
    assert.equal(session.snapshot().hue01, 0.3);
    assert.equal(session.snapshot().saturation01, 0.4);
    assert.equal(fake.log.requests.length, 0);

    session.applyScheduledColor();
    assert.deepEqual(fake.log.requests[0]?.attributes, { hs_color: [108, 40] });
    assert.deepEqual(session.snapshot().currentColorSpec, hsColor(108, 40));

    session.applyScheduledColor();
    assert.equal(fake.log.requests.length, 1);
});

test("toggling the light cancels a scheduled color", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.scheduleColor(0.5, 1);
    session.toggleLight();

    assert.equal(fake.log.colorTimerStops, 1);
    session.applyScheduledColor();
    assert.equal(fake.log.requests.length, 1);
    assert.equal(fake.log.requests[0]?.kind, "toggle");
});

test("an immediate color change cancels a scheduled one", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.scheduleColor(0.1, 0.2);
    session.setColor(0.5, 1);

    assert.equal(fake.log.colorTimerStops, 1);
    session.applyScheduledColor();
    assert.equal(fake.log.requests.length, 1);
    assert.deepEqual(fake.log.requests[0]?.attributes, { hs_color: [180, 100] });
});

test("a connection change drops a scheduled color", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.scheduleColor(0.5, 1);
    session.setConfig({ ...fake.config, entityId: "light.other" });

    assert.equal(fake.log.colorTimerStops, 1);
    session.applyScheduledColor();
    assert.equal(fake.log.requests.filter((request) => request.kind === "turnOn").length, 0);
});

test("flashLight only sends a flash request", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.flashLight();

    assert.deepEqual(fake.log.requests[0]?.attributes, { flash: "short" });
    assert.equal(session.snapshot().lightOn, false);
});

test("a preset moves the wheel and becomes the current color", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.applyPreset({ rgb_color: [0, 255, 0] });

    assert.deepEqual(fake.log.requests[0]?.attributes, { rgb_color: [0, 255, 0] });
    fake.log.requests[0]?.succeed();

    assert.equal(session.snapshot().lightOn, true);
    assert.deepEqual(session.snapshot().currentColorSpec, { rgb_color: [0, 255, 0] });
    assert.equal(session.snapshot().saturation01, 1);
    assert.ok(Math.abs(session.snapshot().hue01 - 1 / 3) < 1e-9);
});

test("preview methods never reach Home Assistant", () => {
    const fake = createFakeHost();
    const session = started(fake);
    session.previewBrightness(12);
    session.previewColor(0.25, 0.5);
    session.previewColorTemp(2400);

    assert.deepEqual(fake.log.requests, []);
    assert.equal(session.snapshot().brightness, 12);
    assert.equal(session.snapshot().hue01, 0.25);
    assert.equal(session.snapshot().colorTempKelvin, 2400);
});

test("a locally saved preset is stored as hex and not saved twice", () => {
    const fake = createFakeHost({ cachedPresetsJson: "[]" });
    const session = started(fake);
    const hex = specToHex(hsColor(180, 100));

    session.previewColor(0.5, 1);
    session.addCurrentPreset();
    session.addCurrentPreset();

    assert.deepEqual(fake.config.localPresets, [hex]);
    assert.equal(fake.log.writes.localPresets.length, 1);
    assert.deepEqual(session.snapshot().presetItems.map((item) => item.hex), [hex]);
    assert.equal(fake.log.requests.length, 0);
});

test("removing a swatch deletes the saved entry behind it", () => {
    // The invalid entry shifts the row index: the second swatch is saved at 2.
    const fake = createFakeHost({ localPresets: ["#ff0000", "junk", "#00ff00"] });
    const session = started(fake);
    assert.deepEqual(session.snapshot().presetItems.map((item) => item.hex), ["#ff0000", "#00ff00"]);

    session.removePreset(1);
    assert.deepEqual(fake.config.localPresets, ["#ff0000", "junk"]);
});

test("a swatch of the sync cache cannot be removed locally", () => {
    const fake = createFakeHost({ syncPresets: true, pollInterval: 15 });
    sessionWithCache(fake);
    const session = started(fake);
    session.removePreset(0);
    assert.deepEqual(fake.config.localPresets, []);
});

test("adding to a sync list needs a synced, writable component", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    fake.syncModule = createFakeSyncModule();

    session.previewColor(0.5, 1);
    session.addCurrentPreset();

    assert.deepEqual(fake.log.writes.cachedPresetsJson, []);
    assert.equal(session.snapshot().presetItems.length, 0);
    assert.deepEqual((fake.syncModule as ReturnType<typeof createFakeSyncModule>).added, []);
});

test("a color that is already a preset is not added again", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    fake.syncModule = createFakeSyncModule();

    connectLamp(fake, session);
    session.handleStatusChanged("synced", "");
    session.handlePermissionChanged(true);
    session.handlePresetsPulled([hsColor(180, 50)], { source: SOURCE, serverPresets: [hsColor(180, 50)] });
    session.addCurrentPreset();

    assert.equal(session.snapshot().syncStatusText, "syncAlreadySaved");
    assert.deepEqual((fake.syncModule as ReturnType<typeof createFakeSyncModule>).added, []);
});

test("an optimistic preset is queued for the sync component", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    const item = createFakeSyncModule();
    fake.syncModule = item;

    connectLamp(fake, session);
    synced(session, [{ rgb_color: [255, 0, 0] }]);
    session.setColor(0.5, 1);
    session.addCurrentPreset();

    assert.deepEqual(item.added, [hsColor(180, 100)]);
    assert.equal(session.snapshot().presetItems.length, 2);
    assert.equal(session.snapshot().syncStatusText, "syncSaving");
    assert.equal(session.snapshot().syncWritable, true);
});

test("a rejected queueAdd falls back to the confirmed server list", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    const item = createFakeSyncModule();
    item.accept = false;
    fake.syncModule = item;

    connectLamp(fake, session);
    synced(session, [{ rgb_color: [255, 0, 0] }]);
    session.setColor(0.5, 1);
    session.addCurrentPreset();

    assert.deepEqual(session.snapshot().presetItems.map((preset) => preset.hex), ["#ff0000"]);
    assert.equal(fake.config.cachedPresetsJson, '[{"rgb_color":[255,0,0]}]');
});

test("a rejected queueAdd without a confirmed state keeps the list and reports it", () => {
    // The cache is only a local mirror: nothing was confirmed by the server yet.
    const fake = createFakeHost({ syncPresets: true });
    sessionWithCache(fake);
    const session = started(fake);
    const item = createFakeSyncModule();
    item.accept = false;
    fake.syncModule = item;

    connectLamp(fake, session);
    session.handleStatusChanged("synced", "");
    session.handlePermissionChanged(true);
    session.setColor(0.5, 1);
    session.addCurrentPreset();

    assert.equal(session.snapshot().syncStatusText, "syncRestoreFailed");
    assert.deepEqual(session.snapshot().presetItems.map((preset) => preset.hex), ["#ff0000", "#00ffff"]);
});

test("presets of another source are dropped", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    session.handlePermissionChanged(true);

    session.handlePresetsPulled([{ rgb_color: [255, 0, 0] }], { source: "other|light.x", serverPresets: [] });

    assert.deepEqual(fake.log.writes.cachedPresetsJson, []);
    assert.equal(session.snapshot().presetItems.length, 0);
});

test("a pulled list becomes the cache and the confirmed state", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    session.handlePermissionChanged(true);
    session.handlePresetsPulled([{ rgb_color: [255, 0, 0] }], {
        source: SOURCE,
        serverPresets: [{ rgb_color: [255, 0, 0] }],
        origin: "custom",
        modifiedAt: 5,
    });

    assert.equal(fake.config.cachedPresetsJson, '[{"rgb_color":[255,0,0]}]');
    assert.equal(fake.config.cachedMetaJson, `{"v":1,"source":"${SOURCE}","origin":"custom","modifiedAt":5,"syncedAt":1700000000}`);
    assert.deepEqual(fake.config.localPresets, ["#ff0000"]);
    assert.equal(session.snapshot().cachedAvailable, true);
    assert.equal(session.snapshot().syncHasData, true);
});

test("write forbidden drops admin rights and restores the confirmed list", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    const item = createFakeSyncModule();
    fake.syncModule = item;

    connectLamp(fake, session);
    synced(session, [{ rgb_color: [255, 0, 0] }]);
    session.setColor(0.5, 1);
    session.addCurrentPreset();
    session.handleWriteForbidden("readonly text");

    assert.equal(session.snapshot().syncAdmin, false);
    assert.equal(session.snapshot().syncState, "readonly");
    assert.equal(session.snapshot().syncStatusText, "readonly text");
    assert.deepEqual(session.snapshot().presetItems.map((preset) => preset.hex), ["#ff0000"]);
});

test("an auth failure clears admin rights but keeps the list", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);

    synced(session, [{ rgb_color: [255, 0, 0] }]);
    session.handleAuthFailed("auth text");

    assert.equal(session.snapshot().syncAdmin, false);
    assert.equal(session.snapshot().syncState, "error");
    assert.equal(session.snapshot().syncStatusText, "auth text");
    assert.equal(session.snapshot().presetItems.length, 1);
});

test("a missing WebSocket module is a permanent loader failure", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);

    session.loaderFailed('module "QtWebSockets" is not installed');
    assert.equal(session.snapshot().syncRetryable, false);
    assert.equal(session.snapshot().syncAdmin, false);
    assert.equal(session.snapshot().syncStatusText, "syncNoWebSockets");
});

test("other loader failures stay retryable and carry the detail", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);

    session.loaderFailed("expected token");
    assert.equal(session.snapshot().syncRetryable, true);
    assert.equal(session.snapshot().syncStatusText, "syncLoadError:expected token");

    session.loaderReady();
    assert.equal(session.snapshot().syncRetryable, true);
});

test("retry reloads a missing component only while the failure is retryable", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);

    session.retrySync();
    assert.equal(fake.log.reloads, 1);
    assert.equal(session.snapshot().syncState, "connecting");

    session.loaderFailed('module "QtWebSockets" is not installed');
    session.retrySync();
    assert.equal(fake.log.reloads, 1);
});

test("retry with a live component retries the sync and refetches the lamp", () => {
    const fake = createFakeHost({ syncPresets: true });
    const session = started(fake);
    const item = createFakeSyncModule();
    fake.syncModule = item;

    session.retrySync();

    assert.equal(item.retries, 1);
    assert.equal(fake.log.requests.length, 1);
    assert.equal(session.snapshot().syncState, "connecting");
});

test("turning sync off drops the cached list and the sync status", () => {
    const fake = createFakeHost({ syncPresets: true, localPresets: ["#00ff00"] });
    sessionWithCache(fake);
    const session = started(fake);
    assert.equal(session.snapshot().syncState, "cached");

    session.setConfig({ ...fake.config, syncPresets: false });
    const view = session.snapshot();

    assert.equal(view.syncEnabled, false);
    assert.equal(view.activeSourceKey, "");
    assert.equal(view.syncState, "off");
    assert.equal(view.syncStatusText, "");
    assert.equal(view.cachedAvailable, false);
    assert.deepEqual(view.presetItems.map((item) => item.hex), ["#00ff00"]);
});

test("renders reuse the derived objects while nothing changed", () => {
    const fake = createFakeHost({ localPresets: ["#ff0000"] });
    const session = started(fake);

    session.previewBrightness(10);
    const first = session.snapshot();
    session.previewBrightness(20);
    const second = session.snapshot();

    assert.equal(first.connection, second.connection);
    assert.equal(first.lightAttributes, second.lightAttributes);
    assert.equal(first.presetItems, second.presetItems);
    assert.equal(first.toolTipSubText, second.toolTipSubText);
    assert.notEqual(first.brightness, second.brightness);
});

test("the tooltip follows connection and lamp state", () => {
    const fake = createFakeHost();
    const session = started(fake);

    session.refresh();
    fake.log.requests[0]?.succeed(lampState());
    assert.equal(session.snapshot().toolTipMainText, "Lamp");
    assert.equal(session.snapshot().toolTipSubText, "tooltipOn(50)\ntooltipHint");

    fake.log.requests.length = 0;
    session.refresh();
    fake.log.requests[0]?.fail({ code: "noConnection" });
    assert.equal(session.snapshot().toolTipSubText, "noConnection\ntooltipHint");
});

function sessionWithCache(fake: FakePanelHost): void {
    fake.config.cachedPresetsJson = '[{"rgb_color":[255,0,0]}]';
    fake.config.cachedMetaJson = cacheMeta(SOURCE);
}
