import type { Format } from "./types";

/**
 * The universal control is 0-10, higher is better, default 7.
 *
 * Each codec maps that scale onto its own native range, concentrated in the
 * band where that codec is actually useful. A linear 0-100 mapping wastes most
 * of the slider below usable quality -- MozJPEG at 20 and AVIF at 20 are both
 * unusable, so no step should land there.
 *
 * The consequence is intended: MozJPEG's 7 and AVIF's 7 are very different
 * native numbers, because those encoders reach comparable visual quality at
 * very different settings.
 */
export const DEFAULT_QUALITY = 7;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map 0-10 onto [lo, hi] linearly, rounded. */
function band(scale: number, lo: number, hi: number): number {
    const t = clamp(scale, 0, 10) / 10;
    return Math.round(lo + (hi - lo) * t);
}

/**
 * MozJPEG: native quality 0-100. Useful band is roughly 40-95.
 * Below 40 the artefacts dominate; above 95 the file grows fast for no visible
 * gain. Default 7 -> 78, a little above the library default of 75.
 */
export function jpegQuality(scale: number): number {
    return band(scale, 40, 95);
}

/**
 * imagequant: native quality 0-100, but it behaves differently from JPEG --
 * it is a palette target, and below ~50 banding becomes obvious on photographic
 * content. Useful band 50-100. Default 7 -> 85.
 */
export function pngQuality(scale: number): number {
    return band(scale, 50, 100);
}

/**
 * libwebp: native quality 0-100. WebP holds up better than JPEG at the low end,
 * so the band starts lower: 35-95. Default 7 -> 77.
 */
export function webpQuality(scale: number): number {
    return band(scale, 35, 95);
}

/**
 * AVIF (aom): native quality 0-100, and it is far more efficient per unit, so
 * its useful band sits much lower -- 25-85. Pushing AVIF to 95 produces files
 * larger than JPEG for no visible benefit, which defeats the point of using it.
 * Default 7 -> 67.
 */
export function avifQuality(scale: number): number {
    return band(scale, 25, 85);
}

/**
 * Effort, for any codec with no quality axis. Currently unused -- our PNG path
 * quantizes, so it has a real quality control -- but kept so a lossless mode
 * added later has somewhere to map, and the slider never goes dead.
 */
export function effortLevel(scale: number, lo = 0, hi = 6): number {
    return band(scale, lo, hi);
}

export function nativeQuality(format: Format, scale: number): number {
    switch (format) {
        case "jpeg": return jpegQuality(scale);
        case "png": return pngQuality(scale);
        case "webp": return webpQuality(scale);
        case "avif": return avifQuality(scale);
    }
}
