/**
 * The typed failure model.
 *
 * The plan's rule is that errors are UX states, never generic crashes or silent
 * failures. Everything the pipeline can fail with lands on one of these codes,
 * carries a `retryable` flag, and carries remediation the row can render.
 *
 * The worker boundary flattens exceptions to strings (`name: message`), so the
 * classifier below reads that string rather than an instance -- an `instanceof`
 * check cannot survive `postMessage`.
 */

export type ErrorCode =
    | "UNSUPPORTED_FORMAT"
    | "FILE_TOO_LARGE"
    | "DECODE_FAILED"
    | "ENCODE_FAILED"
    | "CODEC_UNAVAILABLE"
    | "OUT_OF_MEMORY";

export interface AppError {
    code: ErrorCode;
    /** What went wrong, in the user's terms. */
    message: string;
    /** What they can do about it. Omitted when there is nothing useful to say. */
    remediation?: string;
    /** Whether pressing Retry could plausibly succeed without changing anything. */
    retryable: boolean;
}

/**
 * Upper bound on an input file. Decoded pixels cost ~4 bytes each, so the real
 * ceiling is memory rather than file size, but a compressed file this large is
 * past any point where decoding is likely to survive. The plan's target case --
 * a 20 MB image in a 20-image batch -- sits well inside it.
 */
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;

const ERRORS: Record<ErrorCode, Omit<AppError, "code">> = {
    UNSUPPORTED_FORMAT: {
        message: "Unsupported file type — SmartPress accepts JPEG and PNG.",
        remediation: "Convert the file to JPEG or PNG first, or wait for PDF support.",
        retryable: false,
    },
    FILE_TOO_LARGE: {
        message: "This file is too large to decode in the browser.",
        remediation: "Resize it before compressing, or split the batch.",
        retryable: false,
    },
    DECODE_FAILED: {
        message: "This file could not be decoded.",
        remediation: "It may be truncated or misnamed. Try opening it in an image viewer first.",
        retryable: false,
    },
    ENCODE_FAILED: {
        message: "Compression failed.",
        remediation: "Retry — if it fails again, the file may use a feature the encoder rejects.",
        retryable: true,
    },
    CODEC_UNAVAILABLE: {
        message: "The compressor for this format could not be loaded.",
        remediation: "Check your connection and retry — the codec is served from this site.",
        retryable: true,
    },
    OUT_OF_MEMORY: {
        message: "Ran out of memory decoding this image.",
        remediation: "Close other tabs, or compress fewer files at once.",
        retryable: true,
    },
};

export function appError(code: ErrorCode, detail?: string): AppError {
    const base = ERRORS[code];
    return { code, ...base, message: detail ? `${base.message} (${detail})` : base.message };
}

/**
 * Turn anything thrown by the codec layer into a typed state.
 *
 * Order matters: memory exhaustion surfaces through several unrelated messages
 * and has to be recognised before the generic encode/decode buckets claim it.
 */
export function classify(err: unknown): AppError {
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const text = raw.toLowerCase();

    if (text.includes("out of memory") || text.includes("allocation failed")
        || text.includes("rangeerror") || text.includes("array buffer")) {
        return appError("OUT_OF_MEMORY");
    }
    // Matched on "/wasm/" rather than a leading-slash path: the loader resolves
    // binaries to absolute URLs, so the message carries an origin in front.
    if (text.includes("/wasm/") || text.includes("unavailable in this build")) {
        return appError("CODEC_UNAVAILABLE");
    }
    if (text.includes("decode_failed") || text.includes("could not be decoded")
        || text.includes("source image") || text.includes("invalidstateerror")) {
        return appError("DECODE_FAILED");
    }
    return appError("ENCODE_FAILED", raw);
}
