/**
 * What a compressed file looks like to the save layer. This is the boundary:
 * `lib/codecs/` never creates a Blob, picks a filename, or touches the
 * filesystem, and nothing in this module knows how a format was encoded.
 */
export interface SaveItem {
    blob: Blob;
    filename: string;
    originalSize: number;
    newSize: number;
    /** "original" is the keep-original-file outcome from `isWorthKeeping()`. */
    status: "compressed" | "original";
    /** Desktop only: where the original file lives, so output can go next to it. */
    sourcePath?: string;
}

/** "skipped": nothing was written on purpose (e.g. a kept original that would land on itself). */
export type SaveOutcome = "written" | "sent" | "failed" | "skipped";

export interface SaveOneResult {
    filename: string;
    outcome: SaveOutcome;
    /** Why it failed or was skipped. */
    error?: string;
    /** Desktop only: the path actually written (it may carry a " (2)" suffix). */
    path?: string;
}

/**
 * Where saveAll() should write. Absent means "let the Saver decide" (the web
 * Saver asks for a folder, or falls back to downloads). A directory the user
 * already picked is passed in so a finished batch can land without a second
 * prompt -- a folder picker needs a user gesture, and a batch finishes long
 * after the click that started it.
 */
export interface SaveAllOptions {
    directory?: FileSystemDirectoryHandle;
    /** ZIP name stem when the batch goes out as an archive. Default `smartpress`. */
    archivePrefix?: string;
    /** Desktop: write each file next to its original. */
    nextToSource?: boolean;
    /** Desktop: write into this folder (a path, not a handle). */
    folderPath?: string;
}

export interface SaveAllResult {
    /** Which strategy actually ran, so the UI can word the notice correctly. */
    mode: "directory" | "sequential" | "zip" | "native" | "cancelled";
    results: SaveOneResult[];
    /** Name of the archive handed to the browser. Set only when mode is "zip". */
    archive?: string;
    /** Desktop: where it went, for the notice ("next to the originals", "to <folder>"). */
    destination?: string;
}

/**
 * How SmartPress persists compressed output. `lib/save/web.ts` downloads
 * through the browser. The Tauri build in Sprint 3.3 writes to disk directly
 * behind this same interface -- nothing above this line needs to know which.
 */
export interface Saver {
    saveOne(item: SaveItem, options?: SaveAllOptions): Promise<SaveOneResult>;
    saveAll(items: SaveItem[], options?: SaveAllOptions): Promise<SaveAllResult>;
}
