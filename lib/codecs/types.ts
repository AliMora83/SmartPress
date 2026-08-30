/** Formats the codec layer can encode to. */
export type Format = "jpeg" | "png" | "webp" | "avif";

/**
 * What the universal 0-10 control means for a codec.
 *
 * Lossy codecs spend the scale on visual quality. A lossless codec has no
 * quality axis, so the same control buys encoder effort instead -- the slider
 * never goes dead, per the settings decision.
 */
export type ControlKind = "quality" | "effort";

/**
 * Everything the UI needs to know about a format without knowing which library
 * or binary is behind it. PNG is a vendored quantizer and the rest are npm
 * packages; nothing above this layer can tell.
 */
export interface CodecCapability {
    format: Format;
    mimeType: string;
    extension: string;
    /** Whether encoding discards information. PNG here is lossy: it quantizes. */
    lossy: boolean;
    control: ControlKind;
    /** Vendored binaries under /wasm/ this codec needs before it can encode. */
    wasm: readonly string[];
    /** Roughly how heavy this codec is to load, for UI hints. */
    approxWasmBytes: number;
    /** Absent means available. False means this build cannot encode to it. */
    available?: boolean;
}

/** Options accepted by the public encode(). Quality is the abstract 0-10 scale. */
export interface EncodeOptions {
    /** 0-10, higher is better. Default 7. Mapped per codec in quality.ts. */
    quality?: number;
}

export interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}
