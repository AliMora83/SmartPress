// Postbuild step 2: FAIL the build if the export contains anything it must not ship.
//
// Allowed (everything else matching a rule below fails):
//  - raster/PDF files (.png .jpg .jpeg .pdf) under out/_next/ (bundler-emitted assets)
//  - out/icon.png and out/Smart_icon.png (the app's own icons)
//  - .wasm only under out/wasm/ (the vendored codecs)
// Forbidden anywhere: a __fixtures directory, a bench route/directory.
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const ALLOWED_ICONS = new Set(["icon.png", "Smart_icon.png"]);
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
if (bad.length) {
    console.error("check-export: FAILED. The export contains files it must not ship:\n  " + bad.join("\n  "));
    process.exit(1);
}
console.log("check-export: ok");
