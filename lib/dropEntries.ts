/**
 * Collect files from a drop, descending into any folders.
 *
 * `DataTransfer.files` flattens a dropped folder to a single useless entry, so
 * folders have to be walked through `webkitGetAsEntry()`. That call is only
 * valid synchronously inside the drop event, which is why every entry is
 * grabbed before the first `await`.
 *
 * Files dropped directly are returned as-is (so an unsupported one still gets
 * its typed "unsupported" row). Files found *inside* a folder are filtered by
 * `accept`: dropping a project directory should add its images and PDFs, not
 * a hundred error rows for everything else in it.
 */
export async function filesFromDrop(
    dt: DataTransfer,
    accept: (file: File) => boolean,
): Promise<File[]> {
    const entries: FileSystemEntry[] = [];
    const direct: File[] = [];
    for (const item of Array.from(dt.items)) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
        else {
            const f = item.getAsFile();
            if (f) direct.push(f);
        }
    }

    const out: File[] = [...direct];
    for (const entry of entries) {
        if (entry.isFile) {
            out.push(await fileOf(entry as FileSystemFileEntry));
        } else if (entry.isDirectory) {
            for (const f of await walk(entry as FileSystemDirectoryEntry)) {
                if (accept(f)) out.push(f);
            }
        }
    }
    return out;
}

const fileOf = (entry: FileSystemFileEntry) =>
    new Promise<File>((resolve, reject) => entry.file(resolve, reject));

/** readEntries returns results in batches; keep calling until it returns none. */
async function readAll(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
            reader.readEntries(resolve, reject));
        if (!batch.length) return all;
        all.push(...batch);
    }
}

async function walk(dir: FileSystemDirectoryEntry): Promise<File[]> {
    const files: File[] = [];
    for (const entry of await readAll(dir)) {
        if (entry.isFile) files.push(await fileOf(entry as FileSystemFileEntry));
        else if (entry.isDirectory) files.push(...await walk(entry as FileSystemDirectoryEntry));
    }
    return files;
}
