/**
 * Rules shared by every compression path — the temporary canvas bridge today, the wasm
 * codec layer from Sprint 1.2 onward. Anything deciding whether to keep an encoder's
 * output imports from here rather than restating the rule with its own literal.
 */

/**
 * Minimum fraction of the original size an encode must save to be worth keeping.
 *
 * Re-encoding is not free. A JPEG returned 170 bytes smaller has still spent a full
 * generation of quality to get there, and lossy formats do not recover it. Below this
 * margin the saving does not pay for the loss, so the original is kept instead.
 */
export const MIN_GAIN_RATIO = 0.03;

/**
 * Minimum additional saving, relative to the PNG result, for the WebP nudge to
 * appear. Lives here with the other keep/offer boundaries so the worker and the
 * UI never restate it. Below 10% the extra click and a format change that some
 * recipients can't open aren't worth it.
 */
export const WEBP_NUDGE_MIN_GAIN = 0.10;

/** Whether a WebP of `webpSize` beats a PNG result of `pngSize` by enough to offer. */
export function isWorthNudging(pngSize: number, webpSize: number): boolean {
    if (pngSize <= 0) return false;
    return (pngSize - webpSize) / pngSize > WEBP_NUDGE_MIN_GAIN;
}

/**
 * Whether an encode saved enough to be worth handing to the user in place of their
 * original. A non-positive original size is treated as not worth keeping rather than
 * dividing to Infinity or NaN.
 */
export function isWorthKeeping(originalSize: number, outputSize: number): boolean {
    if (originalSize <= 0) return false;
    return (originalSize - outputSize) / originalSize >= MIN_GAIN_RATIO;
}
