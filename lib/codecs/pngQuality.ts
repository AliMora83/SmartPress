/**
 * Measured quality for a quantized PNG, on imagequant's own 0-100 scale.
 *
 * The vendored pngquant wasm takes one `quality` number, which acts as
 * imagequant's *maximum*; it has no minimum, so it can never refuse an image
 * the way the pngquant CLI's `--quality min-max` does (exit 99). The minimum is
 * therefore enforced here: after quantizing, the output is compared with the
 * source and the error is converted to the same 0-100 scale imagequant uses
 * internally. A result below the preset's minimum is "skipped".
 *
 * This ports imagequant 4.x's error metric (`f_pixel::diff`) and its
 * `quality_to_mse` / `mse_to_quality` pair. It is an emulation, not a binding:
 * imagequant additionally weights pixels by visual importance (edges, flat
 * areas), which is not reproduced, so a measured score tracks the library's own
 * within a few points rather than exactly. `/bench` and AI-Logs.md record the
 * calibration against the real encoder.
 */

const WEIGHT_A = 0.625;
const WEIGHT_R = 0.5;
const WEIGHT_G = 1.0;
const WEIGHT_B = 0.45;
const WEIGHT_MSE = 0.45;
/**
 * Calibration against the real encoder (AI-Logs.md, Sprint 2.2). Asking the
 * wasm for max=q and measuring its output here gives an error 1.1-1.7x
 * imagequant's own budget for q on the photographic fixtures P1-P4, and
 * 0.4-0.7x on the two icon fixtures -- the missing importance weighting is
 * image-dependent, so no single factor is exact. This divides the error by the
 * worst photographic ratio, so a result the encoder met its target on never
 * reads as below it. The bias is deliberate: a wrong "skipped" throws away a
 * file that was fine, while a missed skip only keeps a mediocre one. Genuinely
 * unreachable images (noise: error orders of magnitude over any budget) still
 * score near zero.
 */
const MSE_SCALE = 1 / 1.75;
/** Worst-case error, the score of "quality 0". */
const MAX_DIFF = 66 * 66 / 0.1 / 0.1;

/** sRGB-ish decode table; imagequant's default gamma is 1/2.2. */
const LINEAR = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) t[i] = Math.pow(i / 255, 2.2);
    return t;
})();

/** The MSE imagequant treats as exactly `quality` (1-99; 0 and 100 are the ends). */
export function qualityToMse(quality: number): number {
    if (quality <= 0) return MAX_DIFF;
    if (quality >= 100) return 0;
    const lowFudge = Math.max(0, 0.016 / (0.001 + quality) - 0.001);
    return WEIGHT_MSE * (lowFudge + (2.5 / Math.pow(210 + quality, 1.2)) * ((100.1 - quality) / 100));
}

/** Highest quality whose MSE budget still covers `mse`. */
export function mseToQuality(mse: number): number {
    for (let q = 100; q >= 1; q--) {
        if (mse <= qualityToMse(q) + 0.000001) return q;
    }
    return 0;
}

/**
 * Mean per-pixel error between two same-sized straight-alpha RGBA buffers,
 * in imagequant's weighted premultiplied linear space.
 */
export function meanError(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    const n = a.length / 4;
    if (n === 0 || a.length !== b.length) throw new Error("meanError: buffers must be the same non-zero size");
    let total = 0;
    for (let i = 0; i < a.length; i += 4) {
        const aa = a[i + 3] / 255;
        const ba = b[i + 3] / 255;
        const alphas = WEIGHT_A * (ba - aa);
        const dr = WEIGHT_R * (LINEAR[b[i]] * ba - LINEAR[a[i]] * aa);
        const dg = WEIGHT_G * (LINEAR[b[i + 1]] * ba - LINEAR[a[i + 1]] * aa);
        const db = WEIGHT_B * (LINEAR[b[i + 2]] * ba - LINEAR[a[i + 2]] * aa);
        // Worst case of compositing both pixels onto black or onto white.
        total += Math.max(dr * dr, (dr + alphas) ** 2)
            + Math.max(dg * dg, (dg + alphas) ** 2)
            + Math.max(db * db, (db + alphas) ** 2);
    }
    return (total / n) * MSE_SCALE;
}

/** Quality of `output` as a rendition of `source`, 0-100. */
export function measureQuality(source: Uint8ClampedArray, output: Uint8ClampedArray): number {
    return mseToQuality(meanError(source, output));
}
