// Postbuild step 1: remove what the web export must not ship but Next copies anyway.
//  - __fixtures/: benchmark inputs from public/, dev-only (see app/bench/page.dev.tsx)
//  - _next/static/media/*.wasm: hashed copies emitted from the @jsquash glue's default
//    `new URL(...)` fallback. Runtime never fetches them: encoders.ts hands every codec
//    its binary from /wasm/ via init(module). Verified against `serve out` request logs
//    (Sprint 3.2a follow-up, AI-Logs.md).
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
rmSync(join(OUT, "__fixtures"), { recursive: true, force: true });

const media = join(OUT, "_next", "static", "media");
let removed = 0;
try {
    for (const f of readdirSync(media)) {
        if (f.endsWith(".wasm")) { rmSync(join(media, f)); removed++; }
    }
} catch { /* no media dir: nothing to prune */ }
console.log(`prune-export: removed out/__fixtures and ${removed} hashed .wasm file(s)`);
