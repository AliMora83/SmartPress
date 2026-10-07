// Postbuild step 2 (after prune): turn the sw.js template into the real out/sw.js.
// Walks out/ and precaches everything the app can request offline, including lazily
// loaded files. The cache name hashes the list *with each file's content hash*, so it
// changes whenever any shipped byte changes -- not when the app version does.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
// Never precached: server config, the 404 page, and the worker itself.
const EXCLUDE = (rel) =>
    rel === ".htaccess" || rel === "sw.js" || rel === "404.html"
    || rel.startsWith("404/") || rel.startsWith("_not-found/");

function walk(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, acc);
        else acc.push(relative(OUT, full).split(sep).join("/"));
    }
    return acc;
}

// index.html is addressed by its directory ("/" and "/licenses/").
const toUrl = (rel) => {
    if (rel === "index.html") return "/";
    if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
    return "/" + rel.split("/").map(encodeURIComponent).join("/");
};

const files = walk(OUT).filter((r) => !EXCLUDE(r)).sort();
const hash = createHash("sha256");
let bytes = 0;
const sizes = [];
for (const rel of files) {
    const buf = readFileSync(join(OUT, rel));
    bytes += buf.length;
    sizes.push([rel, buf.length]);
    hash.update(rel + "\0").update(buf).update("\0");
}
const cacheHash = hash.digest("hex").slice(0, 12);
const list = files.map(toUrl);

let sw = readFileSync("public/sw.js", "utf8");
if (!sw.includes("__CACHE_HASH__") || !sw.includes("/*PRECACHE_START*/")) {
    console.error("inject-sw: public/sw.js template markers missing");
    process.exit(1);
}
sw = sw.replace("__CACHE_HASH__", cacheHash)
    .replace(/\/\*PRECACHE_START\*\/[\s\S]*?\/\*PRECACHE_END\*\//,
        () => `/*PRECACHE_START*/${JSON.stringify(list)}/*PRECACHE_END*/`);
writeFileSync(join(OUT, "sw.js"), sw);

console.log(`inject-sw: ${list.length} entries, ${(bytes / 1048576).toFixed(2)} MB, cache smartpress-${cacheHash}`);
sizes.sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([r, n]) => console.log(`  ${String(n).padStart(9)}  ${r}`));
if (bytes > 12 * 1048576) {
    console.error("inject-sw: precache exceeds 12 MB");
    process.exit(1);
}
