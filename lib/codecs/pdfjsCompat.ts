/**
 * The one shim the pdf.js *legacy* build still needs on older WebKit (the
 * system WKWebView on macOS 13, which Tauri uses): `Promise.withResolvers`.
 *
 * The modern pdf.js build was tried first and needed five (`Promise.withResolvers`,
 * `Promise.try`, `URL.parse`, `Math.sumPrecise`, and a global `Iterator` with
 * helpers -- its absence throws at module load), so every target uses the legacy
 * build instead. See public/pdfjs/PROVENANCE.md.
 *
 * Applied before pdf.js loads in the realm that imports it, and, as a module
 * preamble, in pdf.js's own worker. Engines that already have it are untouched.
 */
const WITH_RESOLVERS = `if(typeof Promise.withResolvers!=="function"){Promise.withResolvers=function(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}}`;

export function needsPdfjsShims(): boolean {
    return typeof Promise.withResolvers !== "function";
}

/** Runs in this realm (the codec worker, or the page). */
export function applyPdfjsShims(): void {
    if (!needsPdfjsShims()) return;
    (Promise as unknown as { withResolvers: () => unknown }).withResolvers = function () {
        let resolve!: (v: unknown) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise((a, b) => { resolve = a; reject = b; });
        return { promise, resolve, reject };
    };
}

/**
 * pdf.js worker URL. Normally the vendored worker itself; where a shim is
 * needed, a same-origin blob module that installs it and then imports the real
 * worker, so the shim exists in the worker's own realm.
 */
export function pdfjsWorkerSrc(realWorkerUrl: string): string {
    if (!needsPdfjsShims()) return realWorkerUrl;
    const src = `${WITH_RESOLVERS}\nawait import(${JSON.stringify(realWorkerUrl)});`;
    return URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
}
