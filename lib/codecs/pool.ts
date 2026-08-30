import type { Format } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

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
    quality: number;
    onProgress?: (progress: number) => void;
}

export interface CompressResult {
    bytes: Uint8Array;
    decodeMs: number;
    encodeMs: number;
}

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
        this.live.set(job.id, { slot, waiting: null });

        const onMessage = (e: MessageEvent<WorkerResponse>) => {
            const msg = e.data;
            if (msg.id !== job.id) return;
            if (msg.type === "progress") {
                job.onProgress?.(msg.progress);
                return;
            }
            cleanup();
            if (msg.type === "done") {
                job.onProgress?.(100);
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
            id: job.id, file: job.file, format: job.format, quality: job.quality,
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

        if (entry.waiting) {
            const i = this.queue.indexOf(entry.waiting);
            if (i >= 0) this.queue.splice(i, 1);
            entry.waiting.reject(new Error("CANCELLED"));
            this.live.delete(id);
            return;
        }

        const slot = entry.slot;
        if (slot) {
            slot.worker.terminate();
            const i = this.slots.indexOf(slot);
            if (i >= 0) this.slots.splice(i, 1);
            this.live.delete(id);
            this.pump();
        }
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
