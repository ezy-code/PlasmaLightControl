/** Connection settings shared by every Home Assistant call. */
export interface HaConfig {
    /** Base URL, e.g. "http://homeassistant.local:8123". Missing -> notConfigured. */
    url?: string;
    /** Long-lived access token. Missing -> notConfigured. */
    token?: string;
    entityId?: string;
    /** Request budget in ms; GETs time out after it, POSTs get at least 10 s. */
    timeout?: number;
    /** Isolates the in-flight request registry per widget instance. */
    scope?: string;
}

/** Failure handed to onError; QML reads only `code`, `status` and `detail`. */
export type HaError =
    | { code: "notConfigured" }
    | { code: "noEntityId" }
    /** The XHR finished without an HTTP exchange (DNS, CORS, unreachable host). */
    | { code: "noConnection" }
    /** The transport failed before a response arrived. */
    | { code: "networkError" }
    | { code: "timeout" }
    | { code: "aborted" }
    /** A non-2xx answer: `detail` is the status text or the first 200 body chars. */
    | { code: "httpError"; status: number; detail: string };

export type HaErrorCode = HaError["code"];

export type HaSuccessHandler = (data: unknown) => void;

export type HaFailureHandler = (error: HaError) => void;

export interface LampSummary {
    entityId: string;
    name: string;
}

export type HttpMethod = "GET" | "POST";

/** null and undefined are dropped before the request. */
type Attr<Value> = Value | null | undefined;

/** Attributes for light.turn_on; forwarded as-is, unknown keys are kept. */
export interface LightServiceAttrs {
    /** 0..255. */
    brightness?: Attr<number>;
    /** Percent 0..100 (newer HA alternative to brightness). */
    brightness_pct?: Attr<number>;
    /** Hue 0..360, saturation 0..100. */
    hs_color?: Attr<[number, number]>;
    /** Three 0..255 channels. */
    rgb_color?: Attr<[number, number, number]>;
    /** Four 0..255 channels. */
    rgbw_color?: Attr<[number, number, number, number]>;
    /** Five channels: RGB plus cold and warm white. */
    rgbww_color?: Attr<[number, number, number, number, number]>;
    /** CIE xy chromaticity, both 0..1. */
    xy_color?: Attr<[number, number]>;
    /** Kelvin. */
    color_temp_kelvin?: Attr<number>;
    effect?: Attr<string>;
    flash?: Attr<"short" | "long">;
    /** Seconds. */
    transition?: Attr<number>;
    [attribute: string]: unknown;
}
