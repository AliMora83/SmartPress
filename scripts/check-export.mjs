// Postbuild step 3 (after prune and inject-sw): FAIL the build if the export contains anything it must not ship.
//
// Allowed (everything else matching a rule below fails):
//  - raster/PDF files (.png .jpg .jpeg .pdf) under out/_next/ (bundler-emitted assets)
//  - out/icon.png (the app's own icon)
//  - out/icons/icon-192.png, icon-512.png, icon-maskable-512.png (PWA icons)
//  - .wasm only under out/wasm/ (the vendored codecs)
// Forbidden anywhere: a __fixtures directory, a bench route/directory.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const ALLOWED_ICONS = new Set([
    "icon.png",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
]);
const bad = [];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = relative(OUT, full).split(sep).join("/");
        const isDir = statSync(full).isDirectory();
        const inNext = rel.startsWith("_next/");
        if (name === "__fixtures") bad.push(`${rel} (fixtures)`);
        else if (/^bench(\.|$)/.test(name) || rel.includes("/bench")) bad.push(`${rel} (bench route)`);
        else if (!isDir) {
            if (/\.(png|jpe?g|pdf)$/i.test(name) && !inNext && !ALLOWED_ICONS.has(rel)) bad.push(`${rel} (stray image/PDF)`);
            if (/\.wasm$/i.test(name) && !rel.startsWith("wasm/")) bad.push(`${rel} (wasm outside /wasm/)`);
        }
        if (isDir) walk(full);
    }
}

try { statSync(OUT); } catch { console.error("check-export: out/ not found"); process.exit(1); }
walk(OUT);

// The service worker must carry a real precache list whose every entry exists.
//  - out/manifest.webmanifest is required (the app links it).
//  - out/sw.js: placeholders must be gone, the list non-empty, each entry a file in out/.
function checkServiceWorker() {
    let sw;
    try { sw = readFileSync(join(OUT, "sw.js"), "utf8"); } catch { bad.push("sw.js missing"); return; }
    if (sw.includes("__CACHE_HASH__")) bad.push("sw.js: cache hash not injected");
    const m = sw.match(/\/\*PRECACHE_START\*\/([\s\S]*?)\/\*PRECACHE_END\*\//);
    let list = [];
    try { list = JSON.parse(m?.[1] ?? "[]"); } catch { bad.push("sw.js: precache list unreadable"); return; }
    if (!list.length) { bad.push("sw.js: no injected precache list"); return; }
    for (const url of list) {
        const rel = decodeURIComponent(url.slice(1));
        const file = rel === "" || rel.endsWith("/") ? rel + "index.html" : rel;
        try { if (!statSync(join(OUT, file)).isFile()) throw 0; }
        catch { bad.push(`sw.js precache entry missing from out/: ${url}`); }
    }
    for (const must of ["/", "/licenses/", "/manifest.webmanifest"]) {
        if (!list.includes(must)) bad.push(`sw.js precache lacks ${must}`);
    }
}
checkServiceWorker();

if (bad.length) {
    console.error("check-export: FAILED. The export contains files it must not ship:\n  " + bad.join("\n  "));
    process.exit(1);
}
console.log("check-export: ok");
