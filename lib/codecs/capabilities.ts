import type { CodecCapability, Format } from "./types";

/**
 * The capability table. This is the only place that knows a format's wasm
 * footprint, and the only place the UI should read format facts from.
 *
 * PNG is marked lossy because our PNG path is imagequant -- palette
 * quantization, not lossless optimisation. That is a deliberate licence
 * decision recorded in NOTICE and AI-Logs.md.
 */
export const CAPABILITIES: Readonly<Record<Format, CodecCapability>> = {
    jpeg: {
        format: "jpeg",
        mimeType: "image/jpeg",
        extension: "jpg",
        lossy: true,
        control: "quality",
        wasm: ["mozjpeg_enc.wasm"],
        approxWasmBytes: 251_524,
    },
    png: {
        format: "png",
        mimeType: "image/png",
        extension: "png",
        lossy: true,
        control: "quality",
        wasm: ["pngquant_bg.wasm"],
        approxWasmBytes: 349_781,
    },
    webp: {
        format: "webp",
        mimeType: "image/webp",
        extension: "webp",
        lossy: true,
        control: "quality",
        // Both variants are listed because the runtime picks one by SIMD
        // detection; only the chosen one is ever fetched.
        wasm: ["webp_enc_simd.wasm", "webp_enc.wasm"],
        approxWasmBytes: 345_584,
    },
    avif: {
        format: "avif",
        mimeType: "image/avif",
        extension: "avif",
        lossy: true,
        control: "quality",
        // 3.3 MB, and currently UNAVAILABLE: @jsquash/avif stalls the
        // Turbopack production build. Kept in the table so Sprint 2.2 has the
        // shape to restore, but encoding to it throws. See encoders.ts.
        wasm: ["avif_enc.wasm"],
        approxWasmBytes: 3_485_872,
        available: false,
    },
} as const;

/** Every known format, including unavailable ones. */
export const ALL_FORMATS = Object.keys(CAPABILITIES) as Format[];

/** Formats this build can actually encode to. Use this for UI. */
export const FORMATS = ALL_FORMATS.filter(f => CAPABILITIES[f].available !== false);

export function capabilityOf(format: Format): CodecCapability {
    const c = CAPABILITIES[format];
    if (!c) throw new Error(`Unknown format: ${format}`);
    return c;
}
