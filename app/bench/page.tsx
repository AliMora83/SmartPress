"use client";

/**
 * Sprint 1.2 benchmark harness. Unlinked scratch route at /bench.
 *
 * Runs the fixture set through the codec layer using the real worker pool, so
 * the numbers reflect the same path Sprint 1.3 will wire the UI to. Fixture
 * files live in public/__fixtures/ and are gitignored -- see the AI-Logs entry
 * for how to regenerate them.
 */
import { useCallback, useRef, useState } from "react";
import { getPool } from "@/lib/codecs/pool";
import { formatFromMime, FORMATS, DEFAULT_QUALITY } from "@/lib/codecs";
import type { Format } from "@/lib/codecs";
import { isWorthKeeping } from "@/lib/compression";

type Row = {
    file: string; format: Format; originalBytes: number; outputBytes: number;
    changePct: number; decodeMs: number; encodeMs: number; kept: boolean;
};

export default function BenchPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [log, setLog] = useState<string[]>([]);
    const [jank, setJank] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [sameFormat, setSameFormat] = useState(true);
    const [quality, setQuality] = useState(DEFAULT_QUALITY);
    const idRef = useRef(0);

    const run = useCallback(async (files: FileList | null) => {
        if (!files?.length) return;
        setRows([]); setLog([]); setJank(null); setBusy(true);

        // Responsiveness probe. Only meaningful in a VISIBLE tab: a hidden tab
        // clamps setInterval to ~1s and fakes a ~1000ms stall.
        let worst = 0, last = performance.now();
        const probe = window.setInterval(() => {
            const now = performance.now();
            worst = Math.max(worst, now - last - 16);
            last = now;
        }, 16);

        const pool = getPool();
        const jobs = Array.from(files).flatMap(file => {
            const native = formatFromMime(file.type);
            const targets: Format[] = sameFormat
                ? (native ? [native] : [])
                : ([...FORMATS] as Format[]);
            return targets.map(format => ({ file, format }));
        });

        await Promise.all(jobs.map(async ({ file, format }) => {
            const id = `b${++idRef.current}`;
            try {
                const r = await pool.run({
                    id, file, format, quality,
                });
                const kept = isWorthKeeping(file.size, r.bytes.byteLength);
                setRows(rs => [...rs, {
                    file: file.name, format,
                    originalBytes: file.size, outputBytes: r.bytes.byteLength,
                    changePct: +(((r.bytes.byteLength - file.size) / file.size) * 100).toFixed(2),
                    decodeMs: Math.round(r.decodeMs), encodeMs: Math.round(r.encodeMs), kept,
                }].sort((a, b) => a.file.localeCompare(b.file) || a.format.localeCompare(b.format)));
            } catch (e) {
                setLog(l => [...l, `FAIL ${file.name} -> ${format}: ${e instanceof Error ? e.message : String(e)}`]);
            }
        }));

        clearInterval(probe);
        setJank(Math.round(worst));
        setBusy(false);
    }, [sameFormat, quality]);

    const tsv = rows.map(r =>
        [r.file, r.format, r.originalBytes, r.outputBytes, r.changePct + "%", r.encodeMs].join("\t")
    ).join("\n");

    return (
        <main style={{ padding: 24, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
            <h1>Sprint 1.2 codec benchmark</h1>
            <p>Pool size: {typeof navigator !== "undefined" ? Math.min(navigator.hardwareConcurrency || 4, 4) : "?"} · quality {quality}/10</p>
            <label style={{ display: "block", margin: "8px 0" }}>
                <input type="checkbox" checked={sameFormat} onChange={e => setSameFormat(e.target.checked)} />
                {" "}same-format only (uncheck to cross-encode every fixture to every format)
            </label>
            <label style={{ display: "block", margin: "8px 0" }}>
                quality {quality}/10{" "}
                <input type="range" min={0} max={10} step={0.01} value={quality}
                       onChange={e => setQuality(parseFloat(e.target.value))} />
            </label>
            <input type="file" multiple accept="image/*" disabled={busy} onChange={e => run(e.target.files)} />
            {jank !== null && <p>worst main-thread stall: <b>{jank} ms</b> (valid only in a visible tab)</p>}
            <table id="results" cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr>{["file", "format", "original", "output", "change", "decode ms", "encode ms", "kept?"].map(h =>
                    <th key={h} style={{ borderBottom: "1px solid #999", textAlign: "left" }}>{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.file + r.format}>
                            <td>{r.file}</td><td>{r.format}</td>
                            <td>{r.originalBytes}</td><td>{r.outputBytes}</td>
                            <td>{r.changePct}%</td>
                            <td>{r.decodeMs}</td><td>{r.encodeMs}</td>
                            <td>{r.kept ? "keep output" : "keep original"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <pre id="tsv">{tsv}</pre>
            <pre style={{ color: "crimson" }}>{log.join("\n")}</pre>
        </main>
    );
}
