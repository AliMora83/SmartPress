/**
 * Codec worker. Decodes and encodes off the main thread.
 *
 * Decode happens here rather than on the caller's thread: it keeps a ~100 ms
 * getImageData off the UI thread, and it means no ImageData ever crosses the
 * worker boundary -- the Blob goes in and the encoded bytes come out, which is
 * cheaper than transferring a 16 MB pixel buffer each way.
 */
import { decode, toPlain } from "./decode";
import { encodeDetailed } from "./index";
import type { EncodeOptions, Format, PngQualityReport } from "./types";

export type WorkerRequest = {
    id: string;
    file: Blob;
    format: Format;
    /** The abstract 0-10 scale plus any per-codec options. Curves live in quality.ts. */
    options: EncodeOptions;
};

export type WorkerResponse =
    | { id: string; type: "progress"; stage: "decoding" | "encoding"; progress: number }
    | {
        id: string; type: "done"; bytes: ArrayBuffer; byteLength: number; decodeMs: number; encodeMs: number;
        pageCount?: number; pdfNote?: "signed" | "flatten-not-smaller" | "flatten-failed";
        png?: PngQualityReport;
    }
    | { id: string; type: "error"; error: string };

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(msg, transfer ?? []);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { id, file, format, options } = e.data;
    try {
        // PDF is not "decode pixels, encode pixels" -- it is its own pipeline
        // (cleanup, recompress embedded images, optionally flatten), entirely
        // behind lib/codecs/pdf.ts. Dynamically imported here, not at module
        // load, so an image-only batch never pulls pdf-lib into this worker.
        if (format === "pdf") {
            post({ id, type: "progress", stage: "decoding", progress: 5 });
            const { compressPdf } = await import("./pdf");
            const t0 = performance.now();
            const result = await compressPdf(file, options, (progress, stage) =>
                post({ id, type: "progress", stage, progress }));
            const t1 = performance.now();
            const buf = result.bytes.buffer.slice(
                result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength,
            ) as ArrayBuffer;
            post(
                {
                    id, type: "done", bytes: buf, byteLength: result.bytes.byteLength,
                    decodeMs: 0, encodeMs: t1 - t0, pageCount: result.pageCount, pdfNote: result.note,
                },
                [buf],
            );
            return;
        }

        post({ id, type: "progress", stage: "decoding", progress: 5 });
        const t0 = performance.now();
        const image = await decode(file);
        const t1 = performance.now();

        // These encoders expose no progress callback, so progress is
        // stage-based rather than continuous. Encoding is the long pole
        // (~4.9 s for a 1 MB PNG), so the UI shows it as in-flight from here.
        post({ id, type: "progress", stage: "encoding", progress: 25 });
        const { bytes: out, png } = await encodeDetailed(toPlain(image), format, options);
        const t2 = performance.now();

        const buf = out.buffer.slice(
            out.byteOffset, out.byteOffset + out.byteLength,
        ) as ArrayBuffer;
        post(
            { id, type: "done", bytes: buf, byteLength: out.byteLength, decodeMs: t1 - t0, encodeMs: t2 - t1, png },
            [buf],
        );
    } catch (err) {
        post({ id, type: "error", error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
};
