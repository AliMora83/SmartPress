/**
 * Desktop Saver (Tauri). Same interface as the web one, but results are real:
 * every file is written through the fs plugin and reports its own outcome and final
 * path. Imported only through a dynamic `import()` behind a desktop-target check
 * (see index.ts), so it is not in the web export.
 *
 * Never overwrites. `createNew` makes the write fail if the target exists, and the
 * name then gets " (2)", " (3)"... A file is also never written onto its own source
 * path: "Same as source" skips a kept-original row (its output name *is* the
 * original's), and a folder save that would land on the source path is skipped too.
 */
import { writeFile } from "@tauri-apps/plugin-fs";
import { basename, dirname, join, withCounter } from "../desktop/paths";
import type { SaveAllOptions, SaveAllResult, SaveItem, SaveOneResult, Saver } from "./types";

async function writeUnique(dir: string, filename: string, bytes: Uint8Array): Promise<string> {
    for (let n = 1; n < 100; n++) {
        const path = join(dir, n === 1 ? filename : withCounter(filename, n));
        try {
            await writeFile(path, bytes, { createNew: true });
            return path;
        } catch (e) {
            if (!/exist/i.test(String(e))) throw e;
        }
    }
    throw new Error("Too many files with this name already exist");
}

async function writeOne(item: SaveItem, options: SaveAllOptions): Promise<SaveOneResult> {
    const dir = options.nextToSource
        ? (item.sourcePath ? dirname(item.sourcePath) : null)
        : (options.folderPath ?? null);
    if (!dir) {
        return { filename: item.filename, outcome: "failed", error: "No destination folder for this file." };
    }
    if (item.sourcePath && join(dir, item.filename) === item.sourcePath) {
        return {
            filename: item.filename, outcome: "skipped", path: item.sourcePath,
            error: "Original kept; nothing to write.",
        };
    }
    try {
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        const path = await writeUnique(dir, item.filename, bytes);
        return { filename: item.filename, outcome: "written", path };
    } catch (e) {
        return { filename: item.filename, outcome: "failed", error: e instanceof Error ? e.message : String(e) };
    }
}

export const tauriSaver: Saver = {
    async saveOne(item: SaveItem, options: SaveAllOptions = {}): Promise<SaveOneResult> {
        return writeOne(item, options);
    },

    async saveAll(items: SaveItem[], options: SaveAllOptions = {}): Promise<SaveAllResult> {
        const results: SaveOneResult[] = [];
        for (const item of items) results.push(await writeOne(item, options));
        return {
            mode: "native",
            destination: options.nextToSource ? "next to the originals" : `to ${basename(options.folderPath ?? "folder")}`,
            results,
        };
    },
};
