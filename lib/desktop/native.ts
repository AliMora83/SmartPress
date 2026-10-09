/**
 * Desktop-only: native pickers, drops and file reads for the Tauri shell.
 *
 * Imported only through a dynamic `import()` behind a `NEXT_PUBLIC_TARGET ===
 * "desktop"` check, so none of it (nor `@tauri-apps/*`) reaches the web export.
 *
 * Why this exists: a browser `File` has no path, and "Same as source" needs one.
 * The Rust side (src-tauri/src/lib.rs) returns real paths for the file dialog, the
 * folder dialog and window drops, and grants the fs plugin access to exactly those
 * (runtime scope) -- nothing else is reachable.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { basename, join } from "./paths";

export interface SourceFile {
    file: File;
    path: string;
}

const MIME: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf",
};

const extOf = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

async function readSource(path: string): Promise<SourceFile> {
    const name = basename(path);
    const bytes = await readFile(path);
    return { file: new File([bytes as unknown as BlobPart], name, { type: MIME[extOf(name)] ?? "" }), path };
}

/** Every supported file under `dir`, recursively. Dot-entries and symlinks are skipped. */
async function walk(dir: string, out: string[]): Promise<void> {
    for (const e of await readDir(dir)) {
        if (e.name.startsWith(".") || e.isSymlink) continue;
        const p = join(dir, e.name);
        if (e.isDirectory) await walk(p, out);
        else if (MIME[extOf(e.name)]) out.push(p);
    }
}

async function load(paths: string[]): Promise<SourceFile[]> {
    const out: SourceFile[] = [];
    for (const p of paths) {
        try { out.push(await readSource(p)); } catch { /* unreadable: left out */ }
    }
    return out;
}

/** Native file dialog. Returns the chosen files with their paths, or [] if cancelled. */
export async function pickFiles(): Promise<SourceFile[]> {
    return load(await invoke<string[]>("pick_files"));
}

/** Native folder dialog. Returns the chosen folder's path, or null if cancelled. */
export function pickFolder(): Promise<string | null> {
    return invoke<string | null>("pick_folder");
}

/** Files dropped on the window, folders walked for their images and PDFs. */
export function onDrop(cb: (items: SourceFile[]) => void): Promise<UnlistenFn> {
    return listen<{ path: string; isDir: boolean }[]>("smartpress://drop", async (e) => {
        const paths: string[] = [];
        for (const d of e.payload) {
            if (d.isDir) { try { await walk(d.path, paths); } catch { /* unreadable folder */ } }
            else paths.push(d.path);
        }
        cb(await load(paths));
    });
}

/** Hover state for the drop zone. The drop itself arrives through `onDrop`. */
export async function onDragHover(cb: (active: boolean) => void): Promise<UnlistenFn> {
    const un = await Promise.all([
        listen("tauri://drag-enter", () => cb(true)),
        listen("tauri://drag-over", () => cb(true)),
        listen("tauri://drag-leave", () => cb(false)),
        listen("tauri://drag-drop", () => cb(false)),
    ]);
    return () => un.forEach(f => f());
}

/** Reveal a file in Finder. */
export function reveal(path: string): Promise<void> {
    return revealItemInDir(path);
}
