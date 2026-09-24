import type { SaveAllResult, SaveItem, SaveOneResult, Saver } from "./types";

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

/**
 * Staggered anchor clicks, chained rather than `setTimeout(fn, i * 300)`
 * scheduled up front -- a backgrounded tab coalesces those timers and fires
 * every click at once. The browser reports nothing back, so "sent" is the
 * honest ceiling for this path, not "written". This is the only strategy for
 * now; Sprint 1.4's Task 5 adds a Chromium path with a real per-file signal
 * on top of this boundary.
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

export const webSaver: Saver = {
    async saveOne(item: SaveItem): Promise<SaveOneResult> {
        triggerAnchorDownload(item.blob, item.filename);
        return { filename: item.filename, outcome: "sent" };
    },

    async saveAll(items: SaveItem[]): Promise<SaveAllResult> {
        return await saveAllSequentially(items);
    },
};
