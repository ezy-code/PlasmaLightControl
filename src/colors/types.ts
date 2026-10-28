export type HsColor = [number, number];
export type RgbColor = [number, number, number];
export type RgbwColor = [number, number, number, number];
export type RgbwwColor = [number, number, number, number, number];

/** White/amber temperature in kelvin, e.g. 2700. */
export interface ColorTempSpec {
    color_temp_kelvin: number;
}

/** Hue 0..360 and saturation 0..100, both with at most two decimals. */
export interface HsColorSpec {
    hs_color: HsColor;
}

/** Three 0..255 channels. */
export interface RgbColorSpec {
    rgb_color: RgbColor;
}

/** RGB plus one white channel, four 0..255 channels. */
export interface RgbwColorSpec {
    rgbw_color: RgbwColor;
}

/** RGB plus cold and warm white channels, five 0..255 channels. */
export interface RgbwwColorSpec {
    rgbww_color: RgbwwColor;
}

/** Exactly one color model at a time, all channels rounded. */
export type LightColor =
    | ColorTempSpec
    | HsColorSpec
    | RgbColorSpec
    | RgbwColorSpec
    | RgbwwColorSpec;

/** One edit of the preset list: add is idempotent, remove deletes one match. */
export type ColorOp =
    | { type: "add"; spec: LightColor }
    | { type: "remove"; spec: LightColor };
