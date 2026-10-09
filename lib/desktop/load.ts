/**
 * The only way the UI reaches `./native` (Tauri pickers, drops, reads, reveal).
 *
 * The `import()` sits in the *positive* branch of a literal
 * `process.env.NEXT_PUBLIC_TARGET === "desktop"` test so the bundler folds the test and
 * drops the import on the web target. An early-return form (`!== "desktop"` then
 * import) is NOT eliminated and ships the desktop code in the web export -- that is how
 * it leaked once. Keep it positive, and keep it inline (not behind a shared constant).
 */
export function loadNative(): Promise<typeof import("./native")> {
    if (process.env.NEXT_PUBLIC_TARGET === "desktop") {
        return import("./native");
    }
    return Promise.reject(new Error("Desktop-only"));
}
