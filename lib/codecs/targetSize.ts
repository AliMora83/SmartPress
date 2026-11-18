/**
 * Target size: "get this file under 2 MB".
 *
 * The presets answer "how hard should I squeeze"; a target answers the
 * question people actually arrive with -- a portal that rejects anything over
 * 2 MB, a mail server that bounces at 5. Guessing a preset and re-running is
 * the loop this removes, so the search runs here instead of in the user's head.
 *
 * Two shapes, because the two quality axes are different in kind:
 *
 * - `searchScale` for the calibrated 0-10 scale (JPEG, WebP, PDF images). The
 *   curve in quality.ts is defined at every point on it, so intermediate values
 *   are a legitimate place to land -- /bench already drives the scale directly.
 * - `searchLadder` for lossy PNG, whose user-facing axis is three pngquant
 *   ranges (`PNG_PRESETS`), not the scale. Searching it means trying the three
 *   presets, not inventing ranges between them: a new range would be an
 *   uncalibrated number in a file whose whole point is that its numbers were
 *   measured.
 *
 * **Two rules hold for both.**
 *
 * *The returned result is at or under the target, or the search says it
 * failed.* Nothing here returns a near miss as a success.
 *
 * *A target that cannot be reached returns the result the user would have got
 * without it* -- their own preset -- not the smallest attempt. Shipping a
 * scale-0 encode that still misses 500 KB spends every bit of quality and
 * still fails the user's actual requirement; they are better off with the
 * ordinary result and a row that says the target was out of reach, so they can
 * lower Max size or pick another format.
 */

/** One encode's outcome: the caller's own result object, plus what it weighed. */
export interface Attempt<R> {
    result: R;
    size: number;
    /**
     * False when these bytes must not be used whatever their size -- a lossy
     * PNG that fell below its preset's minimum quality. Default true.
     */
    usable?: boolean;
}

export interface TargetOutcome<R> {
    result: R;
    /** Whether `result` is at or under the target. */
    met: boolean;
    /** Encodes performed, the first attempt included. */
    attempts: number;
}

/**
 * Refinement steps after the target is known to be reachable, by how expensive
 * one encode is. Each step only buys quality -- the result is already under the
 * target -- so the budget is a straight trade against the user's time.
 *
 * Images re-encode from pixels already in memory. A PDF re-parses the document
 * and recompresses every embedded image on each pass, so it gets two.
 */
export const IMAGE_REFINEMENTS = 4;
export const PDF_REFINEMENTS = 2;

/**
 * Scale values are probed on a 0.5 grid. Finer than this is wasted: the JPEG
 * curve rounds to a native integer, and in its middle band 0.5 of scale is
 * about two native units.
 */
const GRID = 0.5;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const fits = <R>(a: Attempt<R>, target: number) => a.usable !== false && a.size <= target;

/**
 * Find the highest quality on the 0-10 scale whose encode fits `target`,
 * starting from `startScale` (the user's preset) and never going above it: the
 * preset stays the ceiling, so a target can only ever make a file smaller than
 * the user asked for, never larger.
 *
 * The floor is probed second, before any bisection. It costs one encode and
 * answers the only question that can't be answered by converging: whether the
 * target is reachable at all. A search that skipped it would spend its whole
 * budget halving its way toward a "no".
 */
export async function searchScale<R>(
    target: number,
    startScale: number,
    encode: (scale: number) => Promise<Attempt<R>>,
    refinements: number = IMAGE_REFINEMENTS,
): Promise<TargetOutcome<R>> {
    let attempts = 0;
    const run = async (scale: number) => { attempts++; return encode(scale); };

    const top = await run(startScale);
    if (fits(top, target)) return { result: top.result, met: true, attempts };

    const floor = await run(0);
    if (!fits(floor, target)) return { result: top.result, met: false, attempts };

    let best = floor;
    let lo = 0;
    let hi = startScale;
    for (let i = 0; i < refinements; i++) {
        const mid = snap((lo + hi) / 2);
        if (mid <= lo || mid >= hi) break;
        const attempt = await run(mid);
        if (fits(attempt, target)) { best = attempt; lo = mid; } else { hi = mid; }
    }
    return { result: best.result, met: true, attempts };
}

/**
 * Try `rungs` in order -- highest quality first -- and keep the first that fits.
 * The caller passes only the rungs at or below the user's preset, so this too
 * can only move downward.
 */
export async function searchLadder<R, T>(
    target: number,
    rungs: readonly T[],
    encode: (rung: T) => Promise<Attempt<R>>,
): Promise<TargetOutcome<R>> {
    let attempts = 0;
    let first: Attempt<R> | undefined;
    for (const rung of rungs) {
        attempts++;
        const attempt = await encode(rung);
        first ??= attempt;
        if (fits(attempt, target)) return { result: attempt.result, met: true, attempts };
    }
    if (!first) throw new Error("searchLadder: no rungs to try");
    return { result: first.result, met: false, attempts };
}
