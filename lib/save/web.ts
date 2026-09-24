import type { SaveAllResult, SaveItem, SaveOneResult, Saver } from "./types";

/**
 * `showDirectoryPicker()` is Chromium-only and not yet in TypeScript's bundled
 * DOM lib. Declared narrowly, on `Window`, rather than pulled in as `any`.
 */
declare global {
    interface Window {
        showDirectoryPicker?: (options?: {
            id?: string;
            mode?: "read" | "readwrite";
        }) => Promise<FileSystemDirectoryHandle>;
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Hands a Blob to the browser's own download machinery via a throwaway
 * anchor. This is the only signal the web platform gives for a single
 * anchor-driven download: none. The click has queued the download by the
 * time this function returns; the object URL is revoked a few seconds later
 * rather than on the next tick, since revoking one out from under a download
 * that has not started reading yet has been observed to cancel it.
 */
function triggerAnchorDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === "AbortError";
}

/**
 * Chromium path: one folder picked once, every file written directly through
 * the File System Access API. `createWritable()` + `write()` + `close()` are
 * real promises that reject on a real failure (quota, revoked permission,
 * disk full), so -- unlike an anchor click -- success is known per file.
 */
async function saveAllToDirectory(items: SaveItem[]): Promise<SaveAllResult> {
    let dir: FileSystemDirectoryHandle;
    try {
        dir = await window.showDirectoryPicker!({ mode: "readwrite" });
    } catch (e) {
        if (isAbort(e)) return { mode: "cancelled", results: [] };
        throw e;
    }

    const results: SaveOneResult[] = [];
    for (const item of items) {
        try {
            const handle = await dir.getFileHandle(item.filename, { create: true });
            const writable = await handle.createWritable();
            await writable.write(item.blob);
            await writable.close();
            results.push({ filename: item.filename, outcome: "written" });
        } catch (e) {
            results.push({
                filename: item.filename,
                outcome: "failed",
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }
    return { mode: "directory", results };
}

/**
 * Fallback for everything else: staggered anchor clicks. Chained rather than
 * `setTimeout(fn, i * 300)` scheduled up front -- a backgrounded tab coalesces
 * those timers and fires every click at once. The browser reports nothing
 * back, so "sent" is the honest ceiling for this path, not "written".
 */
async function saveAllSequentially(items: SaveItem[]): Promise<SaveAllResult> {
    const results: SaveOneResult[] = [];
    for (let i = 0; i < items.length; i++) {
        if (i) await sleep(300);
        triggerAnchorDownload(items[i].blob, items[i].filename);
        results.push({ filename: items[i].filename, outcome: "sent" });
    }
    return { mode: "sequential", results };
}

function hasDirectoryPicker(): boolean {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export const webSaver: Saver = {
    async saveOne(item: SaveItem): Promise<SaveOneResult> {
        triggerAnchorDownload(item.blob, item.filename);
        return { filename: item.filename, outcome: "sent" };
    },

    async saveAll(items: SaveItem[]): Promise<SaveAllResult> {
        if (!items.length) return { mode: "sequential", results: [] };
        if (hasDirectoryPicker()) {
            try {
                return await saveAllToDirectory(items);
            } catch {
                // The picker call itself failed for some reason other than the
                // user cancelling (caught above) -- fall back rather than
                // dead-end the button.
                return await saveAllSequentially(items);
            }
        }
        return await saveAllSequentially(items);
    },
};
