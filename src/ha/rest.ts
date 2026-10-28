import { request } from "./request.ts";
import type {
    HaConfig,
    HaFailureHandler,
    HaSuccessHandler,
    LampSummary,
    LightServiceAttrs,
} from "./types.ts";

export function fetchState(cfg: HaConfig, onSuccess?: HaSuccessHandler, onError?: HaFailureHandler): void {
    if (!cfg.entityId) {
        if (onError)
            onError({ code: "noEntityId" });
        return;
    }
    request(cfg, "GET", `/api/states/${encodeURIComponent(cfg.entityId)}`, null, onSuccess, onError);
}

/** Keeps only light entities; the name falls back to the entity id. */
function toLampSummary(item: unknown): LampSummary | null {
    if (!item || typeof item !== "object")
        return null;

    const state = item as { entity_id?: unknown; attributes?: { friendly_name?: unknown } };
    if (typeof state.entity_id !== "string" || state.entity_id.indexOf("light.") !== 0)
        return null;

    const name = state.attributes?.friendly_name;
    return {
        entityId: state.entity_id,
        name: typeof name === "string" && name ? name : state.entity_id,
    };
}

export function fetchLights(
    cfg: HaConfig,
    onSuccess?: (lamps: LampSummary[]) => void,
    onError?: HaFailureHandler,
): void {
    request(cfg, "GET", "/api/states", null, function (states) {
        const lamps: LampSummary[] = [];
        if (Array.isArray(states)) {
            for (const item of states as unknown[]) {
                const lamp = toLampSummary(item);
                if (lamp)
                    lamps.push(lamp);
            }
        }
        lamps.sort((first, second) => first.name.localeCompare(second.name));
        if (onSuccess)
            onSuccess(lamps);
    }, onError);
}

function lightService(
    cfg: HaConfig,
    service: string,
    body: Record<string, unknown>,
    onSuccess?: HaSuccessHandler,
    onError?: HaFailureHandler,
): void {
    request(cfg, "POST", `/api/services/light/${service}`, body, onSuccess, onError);
}

/** Sends entity_id plus the given attributes; null and undefined are dropped. */
export function turnOn(
    cfg: HaConfig,
    attrs?: LightServiceAttrs | null,
    onSuccess?: HaSuccessHandler,
    onError?: HaFailureHandler,
): void {
    const body: Record<string, unknown> = { entity_id: cfg.entityId };
    if (attrs) {
        for (const key of Object.keys(attrs)) {
            const value = attrs[key];
            if (value !== undefined && value !== null)
                body[key] = value;
        }
    }
    lightService(cfg, "turn_on", body, onSuccess, onError);
}

export function turnOff(cfg: HaConfig, onSuccess?: HaSuccessHandler, onError?: HaFailureHandler): void {
    lightService(cfg, "turn_off", { entity_id: cfg.entityId }, onSuccess, onError);
}

export function toggle(cfg: HaConfig, onSuccess?: HaSuccessHandler, onError?: HaFailureHandler): void {
    lightService(cfg, "toggle", { entity_id: cfg.entityId }, onSuccess, onError);
}
