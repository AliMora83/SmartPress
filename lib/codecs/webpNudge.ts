import { isWorthNudging } from "../compression";
import { encode } from "./index";
import { WEBP_SCALE_FOR_PNG_PRESET } from "./quality";
import type { ImageDataLike, PngPreset } from "./types";

export interface WebpAlternative {
    bytes: Uint8Array;
    /** Fraction saved relative to the PNG result, e.g. 0.23 for 23% smaller. */
    savedRatio: number;
}

/**
 * Encode the same pixels as WebP at the quality tier matching `preset`, and
 * return it only if it beats `pngSize` by more than WEBP_NUDGE_MIN_GAIN.
 *
 * Best-effort: the PNG result is already complete and valid, so a WebP failure
 * (codec missing, out of memory) just means no offer rather than a failed row.
 */
export async function webpAlternative(
    image: ImageDataLike,
    preset: PngPreset,
    pngSize: number,
): Promise<WebpAlternative | null> {
    try {
        const bytes = await encode(image, "webp", { quality: WEBP_SCALE_FOR_PNG_PRESET[preset] });
        if (!isWorthNudging(pngSize, bytes.byteLength)) return null;
        return { bytes, savedRatio: (pngSize - bytes.byteLength) / pngSize };
    } catch {
        return null;
    }
}
