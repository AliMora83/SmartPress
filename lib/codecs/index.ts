/**
 * The codec layer.
 *
 * Nothing above this module knows that JPEG/WebP/AVIF come from @jsquash
 * packages while PNG is a vendored imagequant build, or which wasm binary any
 * of them needs. Swapping a codec -- for instance to a permissively licensed
 * PNG quantizer -- is contained entirely behind this boundary.
 */
export { decode, toPlain } from "./decode";
export { CAPABILITIES, FORMATS, ALL_FORMATS, capabilityOf } from "./capabilities";
export { DEFAULT_QUALITY, nativeQuality } from "./quality";
export { loadWasm, clearWasmCache } from "./loader";
export type {
    Format, CodecCapability, ControlKind, EncodeOptions, ImageDataLike,
} from "./types";

import { getEncoder } from "./encoders";
import { DEFAULT_QUALITY } from "./quality";
import type { EncodeOptions, Format, ImageDataLike } from "./types";

/**
 * Encode already-decoded pixels to `format`.
 *
 * `options.quality` is the abstract 0-10 scale; the per-codec curve in
 * quality.ts turns it into that encoder's native number.
 */
export async function encode(
    data: ImageDataLike,
    format: Format,
    options: EncodeOptions = {},
): Promise<Uint8Array> {
    const encoder = await getEncoder(format);
    return encoder(data, options.quality ?? DEFAULT_QUALITY);
}

/** Best-effort format guess from a file's MIME type. */
export function formatFromMime(mime: string): Format | null {
    switch (mime) {
        case "image/jpeg": return "jpeg";
        case "image/png": return "png";
        case "image/webp": return "webp";
        case "image/avif": return "avif";
        default: return null;
    }
}
