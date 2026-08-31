import type { EncodeOptions, Format, PngMode } from "./types";

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

/**
 * PNG defaults to the lossy palette path. Lossless alone lands near 20% and
 * would make SmartPress look worse than the tools it replaces; lossy is where
 * the ~87% savings measured in Sprint 1.2 come from. The radio in the settings
 * panel makes the choice visible rather than silent -- the plan's PNG decision.
 */
export const DEFAULT_PNG_MODE: PngMode = "lossy";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map 0-10 onto [lo, hi] linearly, rounded. */
function band(scale: number, lo: number, hi: number): number {
    const t = clamp(scale, 0, 10) / 10;
    return Math.round(lo + (hi - lo) * t);
}

/**
 * Map 0-10 through a set of (scale, native) anchors, linear between them.
 *
 * This is what makes a curve non-linear without inventing a formula nobody can
 * check: each anchor is a measured point, and the gaps between them decide how
 * many of the ten steps land in each part of the encoder's range.
 */
function anchored(scale: number, anchors: readonly (readonly [number, number])[]): number {
    const s = clamp(scale, 0, 10);
    for (let i = 1; i < anchors.length; i++) {
        const [s1, q1] = anchors[i];
        if (s > s1) continue;
        const [s0, q0] = anchors[i - 1];
        const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
        return Math.round(q0 + (q1 - q0) * t);
    }
    return anchors[anchors.length - 1][1];
}

/**
 * MozJPEG: native quality 0-100.
 *
 * Recalibrated in Sprint 1.3. The previous curve was a straight line across
 * 40-95, which put the default at native 79 -- a number nobody chose, and one
 * where all four JPEG fixtures came out LARGER than the canvas bridge this
 * layer replaces. Measured on the fixture set (see AI-Logs.md, Sprint 1.3), the
 * last native quality that beats canvas on every fixture is 76; 77 flips two of
 * the four.
 *
 * The anchors come from that sweep:
 *
 *   scale 0 -> 40   floor. Below this the artefacts dominate on every fixture.
 *   scale 2 -> 55   the aggressive tail, crossed in two steps rather than four.
 *   scale 7 -> 75   the default. MozJPEG's own default, the spike-parity point,
 *                   and 1 under the measured 76 ceiling so the acceptance does
 *                   not sit on a knife edge.
 *   scale 10 -> 95  near-lossless ceiling.
 *
 * The middle segment is where the steps are spent: 4 native units per step
 * across 55-75, against 7.5 below and 6.7 above. That matches what the sweep
 * measured -- between 71 and 75 the largest fixture grows 9.8% for four native
 * units, but between 79 and 83 it grows 39% for the same four. Steps up there
 * buy bytes, not quality, so the scale crosses that range quickly.
 */
const JPEG_ANCHORS = [[0, 40], [2, 55], [7, 75], [10, 95]] as const;

export function jpegQuality(scale: number): number {
    return anchored(scale, JPEG_ANCHORS);
}

/**
 * imagequant: native quality 0-100, a palette target rather than a DCT quality.
 *
 * Checked against the same fixture sweep in Sprint 1.3. The default was already
 * in a defensible place -- native 85 sits inside the efficient region and below
 * the measured cliff -- but the curve around it had a real defect at the other
 * end: **native 98, 99 and 100 produce byte-identical output on all four PNG
 * fixtures**, because the quantizer stops quantizing. The old ceiling of 100
 * therefore spent the top of the slider inside a three-value dead zone.
 *
 * Anchors, from the sweep (native 35-100, four fixtures):
 *
 *   scale 0 -> 50   floor. Below it banding shows, and bytes barely move:
 *                   35 to 50 is under 6% on the largest fixture.
 *   scale 2 -> 65   the aggressive band, crossed in two steps.
 *   scale 7 -> 85   the default, kept. 50 to 85 grows the largest fixture 36%;
 *                   92 to 98 grows it 78%. 85 is high quality, below the cliff.
 *   scale 10 -> 98  the last native value that changes the output at all.
 *                   99 and 100 are the same bytes, so the scale stops at 98.
 */
const PNG_ANCHORS = [[0, 50], [2, 65], [7, 85], [10, 98]] as const;

export function pngQuality(scale: number): number {
    return anchored(scale, PNG_ANCHORS);
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
 * Effort, for a codec with no quality axis. Lossless PNG uses it: there is no
 * quality to trade, so the same control buys compression effort instead and the
 * slider never goes dead. oxipng levels run 0-6; below 2 is barely worth the
 * call and 6 is minutes on a large image, so the useful band is 1-5.
 */
export function effortLevel(scale: number, lo = 1, hi = 5): number {
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

/**
 * The single place the abstract scale becomes an encoder's own number.
 *
 * `nativeOverride` short-circuits the curve; it is the calibration seam /bench
 * uses to measure native values directly, and nothing in the product path sets
 * it. Everything else goes through the per-codec curve above.
 */
export function resolveNative(format: Format, options: EncodeOptions = {}): number {
    if (options.nativeOverride !== undefined) return options.nativeOverride;
    return nativeQuality(format, options.quality ?? DEFAULT_QUALITY);
}

/** Lossless PNG spends the scale on effort, not quality. Same seam applies. */
export function resolveEffort(options: EncodeOptions = {}): number {
    if (options.nativeOverride !== undefined) return options.nativeOverride;
    return effortLevel(options.quality ?? DEFAULT_QUALITY);
}
