/** POSIX path helpers for the desktop target (macOS). No Tauri imports: safe to share. */

export function basename(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
    const i = path.lastIndexOf("/");
    return i <= 0 ? "/" : path.slice(0, i);
}

export function join(dir: string, name: string): string {
    return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

/** `name.ext` -> `name (2).ext`, for never overwriting an existing file. */
export function withCounter(filename: string, n: number): string {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? `${filename.slice(0, dot)} (${n})${filename.slice(dot)}` : `${filename} (${n})`;
}
