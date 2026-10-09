import type { Saver } from "./types";
import { webSaver } from "./web";

/**
 * The Saver for this build target. The desktop one is loaded with a dynamic
 * `import()` inside a literal `NEXT_PUBLIC_TARGET === "desktop"` test, which the
 * bundler folds away on the web target -- so `@tauri-apps/*` never enters the web
 * export. Keep the test inline; moving it behind a shared constant defeats that.
 */
export async function getSaver(): Promise<Saver> {
    if (process.env.NEXT_PUBLIC_TARGET === "desktop") {
        return (await import("./tauri")).tauriSaver;
    }
    return webSaver;
}
