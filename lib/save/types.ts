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
}

export type SaveOutcome = "written" | "sent" | "failed";

export interface SaveOneResult {
    filename: string;
    outcome: SaveOutcome;
    error?: string;
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
}

export interface SaveAllResult {
    /** Which strategy actually ran, so the UI can word the notice correctly. */
    mode: "directory" | "sequential" | "zip" | "cancelled";
    results: SaveOneResult[];
    /** Name of the archive handed to the browser. Set only when mode is "zip". */
    archive?: string;
}

/**
 * How SmartPress persists compressed output. `lib/save/web.ts` downloads
 * through the browser. The Tauri build in Sprint 3.3 writes to disk directly
 * behind this same interface -- nothing above this line needs to know which.
 */
export interface Saver {
    saveOne(item: SaveItem): Promise<SaveOneResult>;
    saveAll(items: SaveItem[], options?: SaveAllOptions): Promise<SaveAllResult>;
}
