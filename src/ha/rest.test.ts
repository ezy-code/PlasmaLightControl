import assert from "node:assert/strict";
import test from "node:test";

import { FakeXhr, installFakeXhr } from "../test-support/fake-xhr.test-util.ts";
import { fetchLights, fetchState, toggle, turnOff, turnOn } from "./rest.ts";
import { createRequestScope } from "./request.ts";
import type { HaConfig, LampSummary } from "./types.ts";

function config(overrides: Partial<HaConfig> = {}): HaConfig {
    return {
        url: "http://ha:8123",
        token: "tok",
        entityId: "light.lamp",
        timeout: 5000,
        scope: createRequestScope(),
        ...overrides,
    };
}

test("fetchState encodes the entity id", () => {
    const restore = installFakeXhr();
    try {
        fetchState(config({ entityId: "light.living room" }), () => {}, () => {});
        assert.equal(FakeXhr.latest().url, "http://ha:8123/api/states/light.living%20room");
    } finally {
        restore();
    }
});

test("fetchLights filters light entities, names them and sorts by name", async () => {
    const restore = installFakeXhr();
    try {
        const lamps = await new Promise<LampSummary[]>((resolve, reject) => {
            fetchLights(config(), resolve, reject);
            const xhr = FakeXhr.latest();
            assert.equal(xhr.url, "http://ha:8123/api/states");
            xhr.respond(200, JSON.stringify([
                { entity_id: "sensor.temp", attributes: { friendly_name: "Temp" } },
                { entity_id: "light.zeta", attributes: { friendly_name: "Zeta" } },
                { entity_id: "light.alpha", attributes: { friendly_name: "Alpha" } },
                { entity_id: "light.anonymous", attributes: {} },
                { entity_id: "light.broken" },
                null,
            ]));
        });
        assert.deepEqual(lamps, [
            { entityId: "light.alpha", name: "Alpha" },
            { entityId: "light.anonymous", name: "light.anonymous" },
            { entityId: "light.broken", name: "light.broken" },
            { entityId: "light.zeta", name: "Zeta" },
        ]);
    } finally {
        restore();
    }
});

test("fetchLights returns an empty list for a non-array response", async () => {
    const restore = installFakeXhr();
    try {
        const lamps = await new Promise<LampSummary[]>((resolve) => {
            fetchLights(config(), resolve, () => assert.fail("unexpected error"));
            FakeXhr.latest().respond(200, '{"message":"nope"}');
        });
        assert.deepEqual(lamps, []);
    } finally {
        restore();
    }
});

test("turnOn merges attributes and keeps falsy values", () => {
    const restore = installFakeXhr();
    try {
        turnOn(config(), {
            brightness: 0,
            hs_color: [180, 50],
            transition: undefined,
            flash: null,
            effect: "",
        }, () => {}, () => {});
        const xhr = FakeXhr.latest();
        assert.equal(xhr.method, "POST");
        assert.equal(xhr.url, "http://ha:8123/api/services/light/turn_on");
        assert.equal(xhr.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(xhr.body as string), {
            entity_id: "light.lamp",
            brightness: 0,
            hs_color: [180, 50],
            effect: "",
        });
    } finally {
        restore();
    }
});

test("turnOn without attributes sends only the entity id", () => {
    const restore = installFakeXhr();
    try {
        turnOn(config(), null, () => {}, () => {});
        assert.deepEqual(JSON.parse(FakeXhr.latest().body as string), { entity_id: "light.lamp" });
    } finally {
        restore();
    }
});

test("turnOff and toggle use their own services", () => {
    const restore = installFakeXhr();
    try {
        turnOff(config(), () => {}, () => {});
        const off = FakeXhr.latest();
        assert.equal(off.url, "http://ha:8123/api/services/light/turn_off");
        assert.deepEqual(JSON.parse(off.body as string), { entity_id: "light.lamp" });

        toggle(config(), () => {}, () => {});
        const toggled = FakeXhr.latest();
        assert.equal(toggled.url, "http://ha:8123/api/services/light/toggle");
        assert.deepEqual(JSON.parse(toggled.body as string), { entity_id: "light.lamp" });
    } finally {
        restore();
    }
});
