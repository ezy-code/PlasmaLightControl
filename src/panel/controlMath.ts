export interface WheelPoint {
    x: number;
    y: number;
}

/** A color picked from the wheel: hue and saturation, both 0..1. */
export interface WheelPick {
    hue01: number;
    saturation01: number;
}

// Pointer offset + radius -> hue (angle 0..1) and saturation (distance, max 1).
export function wheelPick(dx: number, dy: number, radius: number): WheelPick {
    const distance = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    if (angle < 0)
        angle += 2 * Math.PI;

    return { hue01: angle / (2 * Math.PI), saturation01: Math.min(1, distance / radius) };
}

/** hue/saturation -> offset of the selector marker from the center, in pixels. */
export function wheelSelector(hue: number, saturation: number, radius: number): WheelPoint {
    const angle = hue * 2 * Math.PI;
    return {
        x: Math.cos(angle) * saturation * radius,
        y: Math.sin(angle) * saturation * radius,
    };
}

/** One wheel event: the new value (null when unchanged) plus the sub-notch remainder. */
export interface WheelStep {
    value: number | null;
    pending: number;
}

const WHEEL_NOTCH = 120;

/** Value moved by `percent` of its `from`..`to` range, or null when it is unchanged. */
function percentStep(value: number, percent: number, from: number, to: number): number | null {
    const percentNow = Math.round((value - from) / (to - from) * 100);
    const nextPercent = Math.max(0, Math.min(100, percentNow + percent));
    const next = Math.round(from + nextPercent / 100 * (to - from));
    return next === value ? null : next;
}

/** Brightness 0..255 + percent step -> new value, or null when it is unchanged. */
export function brightnessStep(brightness: number, deltaPercent: number): number | null {
    return percentStep(brightness, deltaPercent, 0, 255);
}

// Wheel deltas below one notch are kept in `pending` so a high-resolution wheel
// needs the same total delta as a 120-unit mouse wheel per `percent` step.
export function wheelStep(
    value: number,
    pending: number,
    delta: number,
    percent: number,
    from: number,
    to: number,
): WheelStep {
    if (to <= from)
        return { value: null, pending: 0 };

    const total = pending + delta;
    const notches = total < 0 ? Math.ceil(total / WHEEL_NOTCH) : Math.floor(total / WHEEL_NOTCH);
    if (notches === 0)
        return { value: null, pending: total };

    return { value: percentStep(value, notches * percent, from, to), pending: total - notches * WHEEL_NOTCH };
}

/** 0..255 -> percent 0..100, rounded. */
export function brightnessPercent(brightness: number): number {
    return Math.round(brightness / 255 * 100);
}

/** Index of the current effect, or 0 when the list cannot provide one. */
export function effectIndex(effects: unknown, current: unknown): number {
    if (!Array.isArray(effects))
        return 0;
    return Math.max(0, effects.indexOf(current));
}
