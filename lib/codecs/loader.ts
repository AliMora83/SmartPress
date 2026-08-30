/**
 * Wasm loading.
 *
 * Every binary is vendored under /public/wasm/ and fetched from there at
 * runtime. We never let a codec package resolve its own .wasm asset, for two
 * reasons: it makes the bundler responsible for wasm assets (which is what
 * stalled Turbopack during the icodec spike -- see AI-Logs.md), and a package's
 * default resolution can reach for a CDN, which CLAUDE.md forbids outright.
 *
 * Both loader families we deal with accept an already-compiled
 * WebAssembly.Module:
 *   - emscripten (@jsquash)   -> init(module), via instantiateWasm
 *   - wasm-bindgen (pngquant) -> init({ module_or_path: module })
 *
 * so one loader serves both.
 */

/** Compiled modules are cached per binary, so a second file never refetches. */
const cache = new Map<string, Promise<WebAssembly.Module>>();

/** Where vendored binaries are served from. Same origin, always. */
const WASM_BASE = "/wasm/";

export function loadWasm(file: string): Promise<WebAssembly.Module> {
    let pending = cache.get(file);
    if (pending) return pending;

    pending = (async () => {
        const url = `${WASM_BASE}${file}`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
        }
        // compileStreaming needs an application/wasm content type. Next serves
        // /public correctly, but fall back rather than hard-fail on a proxy
        // that rewrites it.
        if (typeof WebAssembly.compileStreaming === "function") {
            try {
                return await WebAssembly.compileStreaming(
                    new Response(res.clone().body, {
                        headers: { "Content-Type": "application/wasm" },
                    }),
                );
            } catch {
                // fall through
            }
        }
        return WebAssembly.compile(await res.arrayBuffer());
    })();

    cache.set(file, pending);
    // A failed load must not poison the cache -- the next attempt should retry.
    pending.catch(() => cache.delete(file));
    return pending;
}

/** Test seam / teardown. */
export function clearWasmCache() {
    cache.clear();
}
