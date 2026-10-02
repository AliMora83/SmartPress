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
export { DEFAULT_QUALITY, DEFAULT_PNG_MODE, DEFAULT_PNG_PRESET, PNG_PRESETS, nativeQuality, effortLevel } from "./quality";
export { loadWasm, clearWasmCache } from "./loader";
export type {
    Format, CodecCapability, ControlKind, EncodeOptions, EncodeResult, ImageDataLike, PngMode,
    PngPreset, PngQualityReport,
} from "./types";

import { getEncoder } from "./encoders";
import type { EncodeOptions, EncodeResult, Format, ImageDataLike } from "./types";

/**
 * Encode already-decoded pixels to `format`.
 *
 * `options.quality` is the abstract 0-10 scale; the per-codec curve in
 * quality.ts turns it into that encoder's native number.
 */
export async function encodeDetailed(
    data: ImageDataLike,
    format: Format,
    options: EncodeOptions = {},
): Promise<EncodeResult> {
    const encoder = await getEncoder(format);
    return encoder(data, options);
}

/** Bytes only. Use `encodeDetailed` when the caller needs the PNG quality report. */
export async function encode(
    data: ImageDataLike,
    format: Format,
    options: EncodeOptions = {},
): Promise<Uint8Array> {
    return (await encodeDetailed(data, format, options)).bytes;
}

/** Best-effort format guess from a file's MIME type. */
export function formatFromMime(mime: string): Format | null {
    switch (mime) {
        case "image/jpeg": return "jpeg";
        case "image/png": return "png";
        case "image/webp": return "webp";
        case "image/avif": return "avif";
        case "application/pdf": return "pdf";
        default: return null;
    }
}
