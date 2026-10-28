import assert from "node:assert/strict";
import test from "node:test";

import { FakeXhr, installFakeXhr } from "../test-support/fake-xhr.test-util.ts";
import { fetchState, turnOn } from "./rest.ts";
import { cancelRequests, createRequestScope, request } from "./request.ts";
import type { HaConfig, HaError } from "./types.ts";

// HaError is a union: only the httpError variant carries status and detail.
function expectHttpError(error: HaError): { code: "httpError"; status: number; detail: string } {
    if (error.code !== "httpError")
        assert.fail(`expected an httpError, got ${error.code}`);
    return error;
}

function config(overrides: Partial<HaConfig> = {}): HaConfig {
    return {
        url: "http://ha:8123/",
        token: "tok",
        entityId: "light.lamp",
        timeout: 3000,
        scope: createRequestScope(),
        ...overrides,
    };
}

test("fetchState sends an authorized GET and parses JSON", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const state = await new Promise<unknown>((resolve) => {
            fetchState(cfg, resolve, () => assert.fail("unexpected error"));
            const xhr = FakeXhr.latest();
            assert.equal(xhr.method, "GET");
            assert.equal(xhr.url, "http://ha:8123/api/states/light.lamp");
            assert.equal(xhr.headers.Authorization, "Bearer tok");
            assert.equal(xhr.timeout, 3000);
            xhr.respond(200, '{"state":"on"}');
        });
        assert.deepEqual(state, { state: "on" });
    } finally {
        restore();
    }
});

test("a non-JSON 2xx response is passed through as text", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const result = await new Promise<unknown>((resolve) => {
            request(cfg, "GET", "/api/states/light.lamp", null, resolve, () => assert.fail("unexpected error"));
            FakeXhr.latest().respond(200, "ok");
        });
        assert.equal(result, "ok");
    } finally {
        restore();
    }
});

test("status 0 reports a missing connection", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const error = await new Promise<HaError>((resolve) => {
            fetchState(cfg, () => assert.fail("unexpected success"), resolve);
            FakeXhr.latest().respond(0);
        });
        assert.equal(error.code, "noConnection");
    } finally {
        restore();
    }
});

test("HTTP errors carry the status and the response detail", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const error = await new Promise<HaError>((resolve) => {
            fetchState(cfg, () => assert.fail("unexpected success"), resolve);
            FakeXhr.latest().respond(401, "unauthorized", "Unauthorized");
        });
        const failure = expectHttpError(error);
        assert.equal(failure.status, 401);
        assert.equal(failure.detail, "Unauthorized");
    } finally {
        restore();
    }
});

test("HTTP errors fall back to the truncated response body", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const error = await new Promise<HaError>((resolve) => {
            fetchState(cfg, () => assert.fail("unexpected success"), resolve);
            FakeXhr.latest().respond(500, "boom");
        });
        assert.equal(expectHttpError(error).detail, "boom");
    } finally {
        restore();
    }
});

test("network and timeout callbacks map to their error codes", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        const network = await new Promise<HaError>((resolve) => {
            fetchState(cfg, () => assert.fail("unexpected success"), resolve);
            FakeXhr.latest().fail();
        });
        assert.equal(network.code, "networkError");

        const timeout = await new Promise<HaError>((resolve) => {
            fetchState(cfg, () => assert.fail("unexpected success"), resolve);
            FakeXhr.latest().timeOut();
        });
        assert.equal(timeout.code, "timeout");
    } finally {
        restore();
    }
});

test("a superseded request is aborted silently and its late response is ignored", async () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        let firstSuccess = 0;
        let firstError = 0;
        fetchState(cfg, () => { firstSuccess += 1; }, () => { firstError += 1; });
        const first = FakeXhr.latest();
        fetchState(cfg, () => {}, () => assert.fail("second request failed"));
        const second = FakeXhr.latest();

        assert.equal(first.aborted, true);
        assert.equal(firstSuccess, 0);
        assert.equal(firstError, 0);

        first.respond(200, '{"state":"stale"}');
        assert.equal(firstSuccess, 0);

        second.respond(200, '{"state":"fresh"}');
    } finally {
        restore();
    }
});

test("requests in different scopes do not cancel each other", () => {
    const restore = installFakeXhr();
    try {
        const firstCfg = config();
        const secondCfg = config({ scope: createRequestScope() });
        fetchState(firstCfg, () => {}, () => {});
        const first = FakeXhr.latest();
        fetchState(secondCfg, () => {}, () => {});
        assert.equal(first.aborted, false);
    } finally {
        restore();
    }
});

test("cancelRequests targets one scope and method", () => {
    const restore = installFakeXhr();
    try {
        const cfg = config();
        fetchState(cfg, () => {}, () => {});
        const get = FakeXhr.latest();
        turnOn(cfg, { brightness: 1 }, () => {}, () => {});
        const post = FakeXhr.latest();

        cancelRequests(cfg.scope, "GET");
        assert.equal(get.aborted, true);
        assert.equal(post.aborted, false);

        cancelRequests(cfg.scope);
        assert.equal(post.aborted, true);
    } finally {
        restore();
    }
});

test("unconfigured requests fail without creating an XHR", () => {
    const restore = installFakeXhr();
    try {
        const errors: string[] = [];
        request(config({ url: "" }), "GET", "/api/states/light.lamp", null, () => {}, (err) => errors.push(err.code));
        request(config({ token: "" }), "GET", "/api/states/light.lamp", null, () => {}, (err) => errors.push(err.code));
        assert.deepEqual(errors, ["notConfigured", "notConfigured"]);
        assert.equal(FakeXhr.instances.length, 0);
    } finally {
        restore();
    }
});

test("fetchState reports a missing entity id", () => {
    const restore = installFakeXhr();
    try {
        const errors: string[] = [];
        fetchState(config({ entityId: "" }), () => {}, (err) => errors.push(err.code));
        assert.deepEqual(errors, ["noEntityId"]);
        assert.equal(FakeXhr.instances.length, 0);
    } finally {
        restore();
    }
});

test("request timeouts follow the configured poll budget", () => {
    const restore = installFakeXhr();
    try {
        const cfg = config({ timeout: 3000 });
        fetchState(cfg, () => {}, () => {});
        assert.equal(FakeXhr.latest().timeout, 3000);

        turnOn(cfg, null, () => {}, () => {});
        assert.equal(FakeXhr.latest().timeout, 10000);

        const unset = config();
        delete unset.timeout;
        fetchState(unset, () => {}, () => {});
        assert.equal(FakeXhr.latest().timeout, 8000);
    } finally {
        restore();
    }
});

test("missing error callbacks are tolerated", () => {
    const restore = installFakeXhr();
    try {
        assert.doesNotThrow(() => fetchState(config({ entityId: "" }), () => {}));
        assert.doesNotThrow(() => request(config({ url: "" }), "GET", "/x", null, () => {}));
    } finally {
        restore();
    }
});
