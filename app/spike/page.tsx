"use client";

/**
 * SPIKE ONLY — throwaway route at /spike, linked from nowhere.
 * Measures icodec against the canvas bridge baseline recorded in AI-Logs.md.
 */
import { useCallback, useRef, useState } from "react";

type Row = {
    file: string;
    codec: string;
    originalBytes: number;
    canvasBytes: number | null;
    icodecBytes: number;
    encodeMs: number;
    loadMs: number;
    vsOriginalPct: number;
    vsCanvasPct: number | null;
};

// Canvas bridge baseline, 3.0.0-alpha.2. PNG rows are the original size because the
// bridge cannot compress PNG at all and correctly keeps the original.
const CANVAS_BASELINE: Record<string, number> = {
    "A-large-q95.jpg": 147087,
    "B-mid-q70.jpg": 74889,
    "C-small-q55.jpg": 57126,
    "D-marginal-q42.jpg": 58580,
    "P1.png": 1065228,
    "P2.png": 629412,
    "P3.png": 321119,
    "P4.png": 115568,
};

export default function SpikePage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [log, setLog] = useState<string[]>([]);
    const [jank, setJank] = useState<number | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const jobId = useRef(0);

    const say = (s: string) => setLog(l => [...l, s]);

    const getWorker = () => {
        workerRef.current ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        return workerRef.current;
    };

    const encode = (codec: "jpeg" | "png", img: ImageData, quality: number) =>
        new Promise<{ byteLength: number; encodeMs: number; loadMs: number; bytes: ArrayBuffer }>((resolve, reject) => {
            const w = getWorker();
            const id = ++jobId.current;
            const onMsg = (e: MessageEvent) => {
                if (e.data.id !== id) return;
                w.removeEventListener("message", onMsg);
                e.data.ok ? resolve(e.data) : reject(new Error(e.data.error));
            };
            w.addEventListener("message", onMsg);
            const data = img.data;
            w.postMessage(
                { id, codec, data, width: img.width, height: img.height, quality },
                [data.buffer],
            );
        });

    const run = useCallback(async (files: FileList | null) => {
        if (!files?.length) return;
        setRows([]); setLog([]); setJank(null);

        // Main-thread responsiveness probe: a 16ms interval whose worst overshoot we keep.
        let worst = 0, last = performance.now();
        const probe = setInterval(() => {
            const now = performance.now();
            worst = Math.max(worst, now - last - 16);
            last = now;
        }, 16);

        for (const file of Array.from(files)) {
            try {
                const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(bitmap, 0, 0);
                const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
                bitmap.close();

                const isPng = file.type === "image/png";
                const codec = isPng ? "png" : "jpeg";
                const r = await encode(codec, img, 75);

                // Spike convenience: keep the encoded bytes reachable for inspection.
                (window as unknown as { __out: Record<string, ArrayBuffer> }).__out ??= {};
                (window as unknown as { __out: Record<string, ArrayBuffer> }).__out[file.name] = r.bytes;

                const canvasBytes = CANVAS_BASELINE[file.name] ?? null;
                setRows(rs => [...rs, {
                    file: file.name,
                    codec: isPng ? "pngquant" : "mozjpeg",
                    originalBytes: file.size,
                    canvasBytes,
                    icodecBytes: r.byteLength,
                    encodeMs: Math.round(r.encodeMs),
                    loadMs: Math.round(r.loadMs),
                    vsOriginalPct: +(((r.byteLength - file.size) / file.size) * 100).toFixed(2),
                    vsCanvasPct: canvasBytes ? +(((r.byteLength - canvasBytes) / canvasBytes) * 100).toFixed(2) : null,
                }]);
                say(`ok ${file.name}`);
            } catch (err) {
                say(`FAIL ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        clearInterval(probe);
        setJank(Math.round(worst));
    }, []);

    return (
        <main style={{ padding: 24, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
            <h1>icodec spike</h1>
            <input type="file" multiple accept="image/jpeg,image/png" onChange={e => run(e.target.files)} />
            {jank !== null && <p>worst main-thread stall during run: <b>{jank} ms</b></p>}
            <table id="results" cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 16 }}>
                <thead><tr>{["file", "codec", "original", "canvas", "icodec", "vs orig", "vs canvas", "encode ms", "load ms"].map(h => <th key={h} style={{ borderBottom: "1px solid #999", textAlign: "left" }}>{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.file}>
                            <td>{r.file}</td><td>{r.codec}</td>
                            <td>{r.originalBytes}</td><td>{r.canvasBytes ?? "-"}</td><td>{r.icodecBytes}</td>
                            <td>{r.vsOriginalPct}%</td><td>{r.vsCanvasPct === null ? "-" : r.vsCanvasPct + "%"}</td>
                            <td>{r.encodeMs}</td><td>{r.loadMs}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <pre>{log.join("\n")}</pre>
        </main>
    );
}
