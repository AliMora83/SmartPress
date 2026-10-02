/** Formats the codec layer can encode to. */
export type Format = "jpeg" | "png" | "webp" | "avif" | "pdf";

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

/**
 * PNG has two paths behind one codec: quantize to a palette (lossy, where the
 * ~87% savings live) or optimise losslessly. The plan settles lossy as the
 * default with a visible radio to switch, so the mode travels with the options
 * rather than being a separate format.
 */
export type PngMode = "lossy" | "lossless";

/**
 * Lossy PNG presets, named for how much compression they apply: `min` is the
 * lightest touch (highest quality), `max` the most aggressive. Each maps to a
 * pngquant `min_quality`-`max_quality` range in quality.ts.
 */
export type PngPreset = "min" | "medium" | "max";

/**
 * What a lossy PNG encode measured about its own output. `skipped` means the
 * quantized result fell below the preset's minimum quality, so the bytes should
 * not be used -- the caller keeps the original.
 */
export interface PngQualityReport {
    preset: PngPreset;
    /** imagequant-scale 0-100, see pngQuality.ts. */
    achieved: number;
    min: number;
    max: number;
    skipped: boolean;
}

export interface EncodeResult {
    bytes: Uint8Array;
    /** Lossy PNG only. */
    png?: PngQualityReport;
}

/** Options accepted by the public encode(). Quality is the abstract 0-10 scale. */
export interface EncodeOptions {
    /** 0-10, higher is better. Default 7. Mapped per codec in quality.ts. */
    quality?: number;
    /**
     * PNG only. Lossy quantizes and spends the control on quality; lossless
     * keeps every pixel and spends it on encoder effort. Ignored by other
     * codecs. Defaults to DEFAULT_PNG_MODE.
     */
    pngMode?: PngMode;
    /**
     * PNG lossy only. Replaces the 0-10 scale for that path: the preset's max
     * is handed to the quantizer and its min is enforced afterwards. Defaults
     * to DEFAULT_PNG_PRESET.
     */
    pngPreset?: PngPreset;
    /**
     * Calibration seam. Bypasses the 0-10 curve and hands the encoder this
     * native value directly. Only /bench sets it -- it exists so a curve can be
     * measured against native quality without editing quality.ts between runs.
     * Nothing in the product path passes it.
     */
    nativeOverride?: number;
    /**
     * PDF only. On (the default) keeps levels 1-2: cleanup plus recompressing
     * embedded images, text stays selectable. Off additionally tries level 3
     * (flatten each page to an image via pdfjs-dist) and keeps whichever
     * result is smaller. Ignored by every other format.
     */
    keepTextSelectable?: boolean;
}

export interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}
