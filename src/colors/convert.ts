import type { HsColor, HsColorSpec, RgbColor, RgbwColor, RgbwwColor } from "./types.ts";

/** Fallback color temperature bounds when a lamp does not report its own. */
export const DEFAULT_MIN_KELVIN = 2700;
export const DEFAULT_MAX_KELVIN = 6500;

export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

// QML signal payloads arrive as array-likes that Array.isArray() rejects.
export function isList(value: unknown): value is ArrayLike<unknown> {
    return value !== null && value !== undefined && typeof value === "object"
        && typeof (value as ArrayLike<unknown>).length === "number";
}

export function toList(value: unknown): unknown[] | null {
    if (!isList(value))
        return null;

    const result: unknown[] = [];
    for (let i = 0; i < value.length; ++i)
        result.push(value[i]);
    return result;
}

export function roundedInt(value: number, minimum: number, maximum: number): number {
    return Math.round(clamp(value, minimum, maximum));
}

export function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

// One rounding rule for every hs_color source (HA sends fractions such as 2.88).
export function roundHs(hue: number, saturation: number): HsColor {
    return [round2(clamp(hue, 0, 360)), round2(clamp(saturation, 0, 100))];
}

export function hsColor(hue: number, saturation: number): HsColorSpec {
    return { hs_color: roundHs(hue, saturation) };
}

// Port of temperature2rgb() from the Home Assistant frontend.
function temperatureRed(temperature: number): number {
    if (temperature <= 66)
        return 255;
    return clamp(329.698727446 * Math.pow(temperature - 60, -0.1332047592), 0, 255);
}

function temperatureGreen(temperature: number): number {
    if (temperature <= 66)
        return clamp(99.4708025861 * Math.log(temperature) - 161.1195681661, 0, 255);
    return clamp(288.1221695283 * Math.pow(temperature - 60, -0.0755148492), 0, 255);
}

function temperatureBlue(temperature: number): number {
    if (temperature >= 66)
        return 255;
    if (temperature <= 19)
        return 0;
    return clamp(138.5177312231 * Math.log(temperature - 10) - 305.0447927307, 0, 255);
}

export function temperature2rgb(kelvin: number): RgbColor {
    const value = kelvin / 100;
    return [
        Math.round(temperatureRed(value)),
        Math.round(temperatureGreen(value)),
        Math.round(temperatureBlue(value)),
    ];
}

export function hsToRgb(hs: unknown): RgbColor | null {
    const values = toList(hs);
    if (values?.length !== 2)
        return null;

    const rawHue = Number(values[0]);
    const rawSaturation = Number(values[1]);
    if (!isFiniteNumber(rawHue) || !isFiniteNumber(rawSaturation))
        return null;

    const hue = ((rawHue % 360) + 360) % 360;
    const saturation = clamp(rawSaturation, 0, 100) / 100;
    const chroma = saturation;
    const offset = 1 - chroma;
    const segment = hue / 60;
    const x = chroma * (1 - Math.abs(segment % 2 - 1));

    let red = 0;
    let green = 0;
    let blue = 0;
    if (segment < 1) {
        red = chroma;
        green = x;
    } else if (segment < 2) {
        red = x;
        green = chroma;
    } else if (segment < 3) {
        green = chroma;
        blue = x;
    } else if (segment < 4) {
        green = x;
        blue = chroma;
    } else if (segment < 5) {
        red = x;
        blue = chroma;
    } else {
        red = chroma;
        blue = x;
    }

    return [
        Math.round((red + offset) * 255),
        Math.round((green + offset) * 255),
        Math.round((blue + offset) * 255),
    ];
}

export function rgbToHs(rgb: unknown): HsColor | null {
    const values = toList(rgb);
    if (!values || values.length < 3)
        return null;

    const rawRed = Number(values[0]);
    const rawGreen = Number(values[1]);
    const rawBlue = Number(values[2]);
    if (!isFiniteNumber(rawRed) || !isFiniteNumber(rawGreen) || !isFiniteNumber(rawBlue))
        return null;

    const red = clamp(rawRed, 0, 255) / 255;
    const green = clamp(rawGreen, 0, 255) / 255;
    const blue = clamp(rawBlue, 0, 255) / 255;

    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;

    let hue = 0;
    if (delta !== 0) {
        if (maximum === red)
            hue = ((green - blue) / delta) % 6;
        else if (maximum === green)
            hue = (blue - red) / delta + 2;
        else
            hue = (red - green) / delta + 4;
        hue *= 60;
        if (hue < 0)
            hue += 360;
    }

    const saturation = maximum === 0 ? 0 : delta / maximum;
    return [round2(hue), round2(saturation * 100)];
}

function gammaCorrect(value: number): number {
    return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

// Home Assistant's xy -> RGB conversion (sRGB, D65) followed by RGB -> HS.
export function xyToHs(xy: unknown): HsColor | null {
    const values = toList(xy);
    if (values?.length !== 2)
        return null;

    const x = Number(values[0]);
    const y = Number(values[1]);
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || y <= 0)
        return null;

    const Y = 1.0;
    const X = (Y / y) * x;
    const Z = (Y / y) * (1 - x - y);

    const red = clamp(gammaCorrect(X * 1.656492 - Y * 0.354851 - Z * 0.255038), 0, 1);
    const green = clamp(gammaCorrect(-X * 0.707196 + Y * 1.655397 + Z * 0.036152), 0, 1);
    const blue = clamp(gammaCorrect(X * 0.051713 - Y * 0.121364 + Z * 1.011530), 0, 1);

    return rgbToHs([red * 255, green * 255, blue * 255]);
}

// Scales outputColors to the input max; the channel count is kept.
export function matchMaxScale<Output extends number[]>(inputColors: number[], outputColors: Output): Output {
    const maxIn = Math.max(...inputColors);
    const maxOut = Math.max(...outputColors);
    const factor = maxOut === 0 ? 0 : maxIn / maxOut;
    return outputColors.map((value) => Math.round(value * factor)) as Output;
}

export function kelvin2mired(kelvin: number): number {
    return kelvin === 0 ? 1000000 : Math.floor(1000000 / kelvin);
}

export function mired2kelvin(mired: number): number {
    return mired === 0 ? 1000000 : Math.floor(1000000 / mired);
}

export function rgbwToRgb(rgbw: RgbwColor): RgbColor {
    const [red, green, blue, white] = rgbw;
    const mixed: RgbColor = [red + white, green + white, blue + white];
    return matchMaxScale([red, green, blue, white], mixed);
}

export function rgbwwToRgb(rgbww: RgbwwColor): RgbColor {
    const [red, green, blue, coldWhite, warmWhite] = rgbww;

    const maxMireds = kelvin2mired(DEFAULT_MIN_KELVIN);
    const minMireds = kelvin2mired(DEFAULT_MAX_KELVIN);
    const range = maxMireds - minMireds;
    let ratio = 0.5;
    if (coldWhite + warmWhite !== 0)
        ratio = warmWhite / (coldWhite + warmWhite);

    const mired = minMireds + ratio * range;
    const kelvin = mired ? mired2kelvin(mired) : 0;
    const white = temperature2rgb(kelvin);
    const whiteLevel = Math.max(coldWhite, warmWhite) / 255;
    const mixed: RgbColor = [
        red + white[0] * whiteLevel,
        green + white[1] * whiteLevel,
        blue + white[2] * whiteLevel,
    ];
    return matchMaxScale([red, green, blue, coldWhite, warmWhite], mixed);
}
