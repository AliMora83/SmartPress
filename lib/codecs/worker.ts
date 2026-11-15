/**
 * Codec worker. Decodes and encodes off the main thread.
 *
 * Decode happens here rather than on the caller's thread: it keeps a ~100 ms
 * getImageData off the UI thread, and it means no ImageData ever crosses the
 * worker boundary -- the Blob goes in and the encoded bytes come out, which is
 * cheaper than transferring a 16 MB pixel buffer each way.
 */
import { decodeFit, toPlain } from "./decode";
import { isWorthKeeping } from "../compression";
import { encodeDetailed } from "./index";
import { DEFAULT_PNG_MODE, DEFAULT_PRESET, DEFAULT_QUALITY, PRESET_LADDER } from "./quality";
import { PDF_REFINEMENTS, searchLadder, searchScale } from "./targetSize";
import { webpAlternative } from "./webpNudge";
import type { EncodeOptions, Format, ImageDataLike, PngQualityReport } from "./types";

export type WorkerRequest = {
    id: string;
    file: Blob;
    format: Format;
    /** The abstract 0-10 scale plus any per-codec options. Curves live in quality.ts. */
    options: EncodeOptions;
    /**
     * Images only. Encode to this format instead of the input's own. Absent
     * means "keep format". Ignored for PDF.
     */
    outputFormat?: Format;
    /** Images only. Cap the longest side at this many pixels; never enlarges. Ignored for PDF. */
    maxDimension?: number;
    /**
     * Encode repeatedly, searching for the largest result at or under this many
     * bytes, instead of encoding once at `options`. See targetSize.ts — the
     * options stay the ceiling, and an unreachable target comes back as
     * `targetMet: false` carrying the ordinary result.
     */
    targetBytes?: number;
};

export type WorkerResponse =
    | { id: string; type: "progress"; stage: "decoding" | "encoding"; progress: number }
    | {
        id: string; type: "done"; bytes: ArrayBuffer; byteLength: number; decodeMs: number; encodeMs: number;
        pageCount?: number; pdfNote?: "signed" | "flatten-not-smaller" | "flatten-failed";
        png?: PngQualityReport;
        webp?: { bytes: ArrayBuffer; savedRatio: number };
        /** The format `bytes` is actually in. */
        format: Format;
        /** Images only: output pixel size, and whether it was scaled down to get there. */
        width?: number; height?: number; resized?: boolean;
        /** Target size only: whether `bytes` came in at or under the target. */
        targetMet?: boolean;
        /** Target size only: how many encodes the search spent. */
        attempts?: number;
    }
    | { id: string; type: "error"; error: string };

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(msg, transfer ?? []);

interface ImageEncode {
    bytes: Uint8Array;
    png?: PngQualityReport;
    targetMet?: boolean;
    attempts?: number;
}

/**
 * One encode, or -- with a target -- a search for the best one that fits it.
 *
 * Which search depends on what the format's quality axis is: the calibrated
 * 0-10 scale, the three pngquant presets, or nothing at all. Lossless PNG has
 * no quality to trade, so searching it would mean encoding the same bytes
 * repeatedly; it is simply measured once against the target.
 */
async function encodeImage(
    image: ImageDataLike,
    format: Format,
    options: EncodeOptions,
    targetBytes: number | undefined,
    onAttempt: () => void,
): Promise<ImageEncode> {
    if (targetBytes === undefined) return encodeDetailed(image, format, options);

    const lossless = format === "png" && (options.pngMode ?? DEFAULT_PNG_MODE) === "lossless";
    if (lossless) {
        onAttempt();
        const { bytes, png } = await encodeDetailed(image, format, options);
        return { bytes, png, targetMet: bytes.byteLength <= targetBytes, attempts: 1 };
    }

    if (format === "png") {
        const start = options.pngPreset ?? DEFAULT_PRESET;
        const rungs = PRESET_LADDER.slice(PRESET_LADDER.indexOf(start));
        const { result, met, attempts } = await searchLadder(targetBytes, rungs, async pngPreset => {
            onAttempt();
            const encoded = await encodeDetailed(image, format, { ...options, pngPreset });
            // A skipped PNG is below its preset's minimum quality: those bytes
            // are not usable at any size, so the search moves on rather than
            // accepting them for fitting.
            return { result: encoded, size: encoded.bytes.byteLength, usable: encoded.png?.skipped !== true };
        });
        return { bytes: result.bytes, png: result.png, targetMet: met, attempts };
    }

    const { result, met, attempts } = await searchScale(
        targetBytes, options.quality ?? DEFAULT_QUALITY,
        async quality => {
            onAttempt();
            const encoded = await encodeDetailed(image, format, { ...options, quality });
            return { result: encoded, size: encoded.bytes.byteLength };
        },
    );
    return { bytes: result.bytes, png: result.png, targetMet: met, attempts };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { id, file, format, options, outputFormat, maxDimension, targetBytes } = e.data;
    try {
        // A target search encodes the same file several times, so a per-encode
        // progress number would run 0-100 once per attempt and read as a stall
        // that keeps restarting. Attempts drive the bar instead, forward only,
        // and the encoder's own progress is dropped for the duration.
        const searching = targetBytes !== undefined;
        let attempt = 0;
        const onAttempt = () => {
            attempt++;
            post({ id, type: "progress", stage: "encoding", progress: Math.min(90, 20 + attempt * 12) });
        };

        // PDF is not "decode pixels, encode pixels" -- it is its own pipeline
        // (cleanup, recompress embedded images, optionally flatten), entirely
        // behind lib/codecs/pdf.ts. Dynamically imported here, not at module
        // load, so an image-only batch never pulls pdf-lib into this worker.
        if (format === "pdf") {
            post({ id, type: "progress", stage: "decoding", progress: 5 });
            const { compressPdf } = await import("./pdf");
            const relay = (progress: number, stage: "decoding" | "encoding") => {
                if (!searching) post({ id, type: "progress", stage, progress });
            };
            const t0 = performance.now();
            // Each attempt re-parses the document and recompresses every
            // embedded image, so a PDF search gets a smaller refinement budget
            // than an image one.
            const search = searching
                ? await searchScale(targetBytes, options.quality ?? DEFAULT_QUALITY, async quality => {
                    onAttempt();
                    const attempted = await compressPdf(file, { ...options, quality }, relay);
                    return { result: attempted, size: attempted.bytes.byteLength };
                }, PDF_REFINEMENTS)
                : undefined;
            const result = search?.result ?? await compressPdf(file, options, relay);
            const t1 = performance.now();
            const buf = result.bytes.buffer.slice(
                result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength,
            ) as ArrayBuffer;
            post(
                {
                    id, type: "done", bytes: buf, byteLength: result.bytes.byteLength,
                    decodeMs: 0, encodeMs: t1 - t0, pageCount: result.pageCount, pdfNote: result.note,
                    format: "pdf", targetMet: search?.met, attempts: search?.attempts,
                },
                [buf],
            );
            return;
        }

        post({ id, type: "progress", stage: "decoding", progress: 5 });
        const t0 = performance.now();
        const { image, resized } = await decodeFit(file, maxDimension);
        const target = outputFormat ?? format;
        const plain = toPlain(image);
        const t1 = performance.now();

        // These encoders expose no progress callback, so progress is
        // stage-based rather than continuous. Encoding is the long pole
        // (~4.9 s for a 1 MB PNG), so the UI shows it as in-flight from here.
        post({ id, type: "progress", stage: "encoding", progress: 25 });
        const { bytes: out, png, targetMet, attempts } =
            await encodeImage(plain, target, options, targetBytes, onAttempt);
        const t2 = performance.now();

        const buf = out.buffer.slice(
            out.byteOffset, out.byteOffset + out.byteLength,
        ) as ArrayBuffer;
        const transfer: Transferable[] = [buf];

        // WebP nudge: PNG only, and only for a lossy result that cleared its
        // preset's minimum -- a skipped file has no result to compare against,
        // and lossless has no quality tier to match. The baseline is what the
        // user will actually get, which is the original when the PNG encode
        // wasn't worth keeping. Keyed on the output format: a PNG being
        // converted already is the WebP, so there is nothing left to offer.
        let webp: { bytes: ArrayBuffer; savedRatio: number } | undefined;
        if (target === "png" && png && !png.skipped) {
            const baseline = isWorthKeeping(file.size, out.byteLength) ? out.byteLength : file.size;
            const alt = await webpAlternative(toPlain(image), png.preset, baseline);
            if (alt) {
                const wbuf = alt.bytes.buffer.slice(
                    alt.bytes.byteOffset, alt.bytes.byteOffset + alt.bytes.byteLength,
                ) as ArrayBuffer;
                webp = { bytes: wbuf, savedRatio: alt.savedRatio };
                transfer.push(wbuf);
            }
        }
        post(
            {
                id, type: "done", bytes: buf, byteLength: out.byteLength, decodeMs: t1 - t0, encodeMs: t2 - t1, png, webp,
                format: target, width: image.width, height: image.height, resized,
                targetMet, attempts,
            },
            transfer,
        );
    } catch (err) {
        post({ id, type: "error", error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
};
