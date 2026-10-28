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

/** Brightness 0..255 + percent step -> new value, or null when it is unchanged. */
export function brightnessStep(brightness: number, deltaPercent: number): number | null {
    const percent = Math.max(0, Math.min(100, Math.round(brightness / 255 * 100) + deltaPercent));
    const next = Math.round(percent * 255 / 100);
    return next === brightness ? null : next;
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
