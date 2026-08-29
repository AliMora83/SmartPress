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
 * Whether an encode saved enough to be worth handing to the user in place of their
 * original. A non-positive original size is treated as not worth keeping rather than
 * dividing to Infinity or NaN.
 */
export function isWorthKeeping(originalSize: number, outputSize: number): boolean {
    if (originalSize <= 0) return false;
    return (originalSize - outputSize) / originalSize >= MIN_GAIN_RATIO;
}
