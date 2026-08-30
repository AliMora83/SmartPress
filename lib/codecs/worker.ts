/**
 * Codec worker. Decodes and encodes off the main thread.
 *
 * Decode happens here rather than on the caller's thread: it keeps a ~100 ms
 * getImageData off the UI thread, and it means no ImageData ever crosses the
 * worker boundary -- the Blob goes in and the encoded bytes come out, which is
 * cheaper than transferring a 16 MB pixel buffer each way.
 */
import { decode, toPlain } from "./decode";
import { encode } from "./index";
import type { Format } from "./types";

export type WorkerRequest = {
    id: string;
    file: Blob;
    format: Format;
    quality: number;
};

export type WorkerResponse =
    | { id: string; type: "progress"; stage: "decoding" | "encoding"; progress: number }
    | { id: string; type: "done"; bytes: ArrayBuffer; byteLength: number; decodeMs: number; encodeMs: number }
    | { id: string; type: "error"; error: string };

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(msg, transfer ?? []);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { id, file, format, quality } = e.data;
    try {
        post({ id, type: "progress", stage: "decoding", progress: 5 });
        const t0 = performance.now();
        const image = await decode(file);
        const t1 = performance.now();

        // These encoders expose no progress callback, so progress is
        // stage-based rather than continuous. Encoding is the long pole
        // (~4.9 s for a 1 MB PNG), so the UI shows it as in-flight from here.
        post({ id, type: "progress", stage: "encoding", progress: 25 });
        const out = await encode(toPlain(image), format, { quality });
        const t2 = performance.now();

        const buf = out.buffer.slice(
            out.byteOffset, out.byteOffset + out.byteLength,
        ) as ArrayBuffer;
        post(
            { id, type: "done", bytes: buf, byteLength: out.byteLength, decodeMs: t1 - t0, encodeMs: t2 - t1 },
            [buf],
        );
    } catch (err) {
        post({ id, type: "error", error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
};
