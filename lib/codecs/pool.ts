import type { EncodeOptions, Format } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

/** Which half of the job a progress tick belongs to. Mirrors the worker. */
export type Stage = "decoding" | "encoding";

/**
 * Worker pool.
 *
 * Sized to min(hardwareConcurrency, 4). At ~4.9 s for a 1 MB PNG this is
 * load-bearing: a queue of ten must keep draining and the main thread must stay
 * free. Cancellation terminates the worker actually running the job, because
 * a wasm encode cannot be interrupted cooperatively -- there is no yield point
 * inside it to check a flag.
 */

export const POOL_SIZE = Math.min(
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4,
    4,
);

export interface CompressJob {
    id: string;
    file: Blob;
    format: Format;
    /** The abstract 0-10 scale plus per-codec options; curves live in quality.ts. */
    options: EncodeOptions;
    /**
     * Stage is passed through, not just the number. These encoders expose no
     * progress callback, so a percentage alone crawls and reads as hung; the UI
     * needs to say which stage it is in.
     */
    onProgress?: (progress: number, stage: Stage) => void;
}

export interface CompressResult {
    bytes: Uint8Array;
    decodeMs: number;
    encodeMs: number;
}

/**
 * Cancellation is not a failure. Callers check `name` rather than matching on a
 * message, so a cancelled row can stay quiet instead of rendering an error.
 */
export class CancelledError extends Error {
    constructor() {
        super("CANCELLED");
        this.name = "CancelledError";
    }
}

export const isCancelled = (e: unknown) =>
    e instanceof Error && (e.name === "CancelledError" || e.message === "CANCELLED");

type Slot = { worker: Worker; jobId: string | null };

type Waiting = {
    job: CompressJob;
    resolve: (r: CompressResult) => void;
    reject: (e: Error) => void;
};

export class CodecPool {
    private slots: Slot[] = [];
    private queue: Waiting[] = [];
    /** Jobs that are queued or running, so cancel() can reach either. */
    private live = new Map<string, { slot: Slot | null; waiting: Waiting | null }>();
    private disposed = false;

    private spawn(): Worker {
        return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    }

    private freeSlot(): Slot | null {
        for (const s of this.slots) if (!s.jobId) return s;
        if (this.slots.length < POOL_SIZE) {
            const s: Slot = { worker: this.spawn(), jobId: null };
            this.slots.push(s);
            return s;
        }
        return null;
    }

    run(job: CompressJob): Promise<CompressResult> {
        if (this.disposed) return Promise.reject(new Error("Pool disposed"));
        return new Promise<CompressResult>((resolve, reject) => {
            const waiting: Waiting = { job, resolve, reject };
            this.live.set(job.id, { slot: null, waiting });
            this.queue.push(waiting);
            this.pump();
        });
    }

    private pump() {
        while (this.queue.length) {
            const slot = this.freeSlot();
            if (!slot) return;
            const waiting = this.queue.shift()!;
            this.dispatch(slot, waiting);
        }
    }

    private dispatch(slot: Slot, waiting: Waiting) {
        const { job } = waiting;
        slot.jobId = job.id;
        // The waiting entry stays reachable after dispatch: cancelling a running
        // job terminates its worker, and something still has to settle the
        // caller's promise or it hangs forever.
        this.live.set(job.id, { slot, waiting });

        const onMessage = (e: MessageEvent<WorkerResponse>) => {
            const msg = e.data;
            if (msg.id !== job.id) return;
            if (msg.type === "progress") {
                job.onProgress?.(msg.progress, msg.stage);
                return;
            }
            cleanup();
            if (msg.type === "done") {
                job.onProgress?.(100, "encoding");
                waiting.resolve({
                    bytes: new Uint8Array(msg.bytes),
                    decodeMs: msg.decodeMs,
                    encodeMs: msg.encodeMs,
                });
            } else {
                waiting.reject(new Error(msg.error));
            }
        };

        const onError = (ev: ErrorEvent) => {
            cleanup();
            waiting.reject(new Error(ev.message || "Worker crashed"));
        };

        const cleanup = () => {
            slot.worker.removeEventListener("message", onMessage as EventListener);
            slot.worker.removeEventListener("error", onError as EventListener);
            slot.jobId = null;
            this.live.delete(job.id);
            this.pump();
        };

        slot.worker.addEventListener("message", onMessage as EventListener);
        slot.worker.addEventListener("error", onError as EventListener);

        const req: WorkerRequest = {
            id: job.id, file: job.file, format: job.format, options: job.options,
        };
        slot.worker.postMessage(req);
    }

    /**
     * Cancel a job. If it is still queued it is simply dropped; if it is running
     * the worker is terminated and replaced, since a wasm encode in progress
     * cannot be asked to stop.
     */
    cancel(id: string) {
        const entry = this.live.get(id);
        if (!entry) return;
        this.live.delete(id);

        // Queued but not started: drop it from the queue, no worker involved.
        if (!entry.slot) {
            if (entry.waiting) {
                const i = this.queue.indexOf(entry.waiting);
                if (i >= 0) this.queue.splice(i, 1);
                entry.waiting.reject(new CancelledError());
            }
            return;
        }

        // Running: kill the worker. Its listeners die with it, so the promise
        // is settled here rather than by a message that will never arrive.
        const slot = entry.slot;
        slot.worker.terminate();
        const i = this.slots.indexOf(slot);
        if (i >= 0) this.slots.splice(i, 1);
        entry.waiting?.reject(new CancelledError());
        this.pump();
    }

    /** Cancel everything -- queue clear, or unmount. */
    cancelAll() {
        for (const id of [...this.live.keys()]) this.cancel(id);
        this.queue.length = 0;
    }

    dispose() {
        this.disposed = true;
        this.cancelAll();
        for (const s of this.slots) s.worker.terminate();
        this.slots.length = 0;
    }
}

let shared: CodecPool | null = null;
export function getPool(): CodecPool {
    return (shared ??= new CodecPool());
}
