"use client";

/**
 * Codec benchmark harness. Unlinked scratch route at /bench.
 *
 * Runs the fixture set through the codec layer using the real worker pool, so
 * the numbers reflect the same path the UI takes. Fixture files live in
 * public/__fixtures/ and are gitignored -- see the AI-Logs entry for how to
 * regenerate them.
 *
 * Sprint 1.3 added two things: fixtures load by fetch rather than through a
 * file picker (so a run is reproducible and scriptable), and a native sweep
 * that drives `nativeOverride` directly. The sweep is how the JPEG curve was
 * recalibrated -- it measures the encoder against native quality without
 * editing quality.ts between runs.
 */
import { useCallback, useRef, useState } from "react";
import { getPool } from "@/lib/codecs/pool";
import { formatFromMime, FORMATS, DEFAULT_QUALITY, DEFAULT_PNG_MODE } from "@/lib/codecs";
import type { Format, PngMode } from "@/lib/codecs";
import { isWorthKeeping } from "@/lib/compression";

/** The fixture set, with the canvas-bridge bytes each one must beat. */
const FIXTURES: { name: string; canvas: number }[] = [
    { name: "A-large-q95.jpg", canvas: 147_087 },
    { name: "B-mid-q70.jpg", canvas: 74_889 },
    { name: "C-small-q55.jpg", canvas: 57_126 },
    { name: "D-marginal-q42.jpg", canvas: 58_580 },
    // Canvas cannot compress PNG at all, so its "output" is the original.
    { name: "P1.png", canvas: 1_065_228 },
    { name: "P2.png", canvas: 629_412 },
    { name: "P3.png", canvas: 321_119 },
    { name: "P4.png", canvas: 115_568 },
];

const CANVAS = new Map(FIXTURES.map(f => [f.name, f.canvas]));

type Row = {
    file: string; format: Format; native: number | "curve";
    originalBytes: number; outputBytes: number;
    changePct: number; vsCanvasPct: number; beatsCanvas: boolean;
    decodeMs: number; encodeMs: number; kept: boolean;
};

const sortRows = (rs: Row[]) => [...rs].sort((a, b) =>
    a.file.localeCompare(b.file) ||
    (typeof a.native === "number" && typeof b.native === "number" ? a.native - b.native : 0) ||
    a.format.localeCompare(b.format));

export default function BenchPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [log, setLog] = useState<string[]>([]);
    const [jank, setJank] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [sameFormat, setSameFormat] = useState(true);
    const [quality, setQuality] = useState(DEFAULT_QUALITY);
    const [pngMode, setPngMode] = useState<PngMode>(DEFAULT_PNG_MODE);
    const [sweepFrom, setSweepFrom] = useState(70);
    const [sweepTo, setSweepTo] = useState(86);
    const idRef = useRef(0);

    /** Load the fixture set from /public. No file picker, so runs are repeatable. */
    const loadFixtures = useCallback(async (): Promise<File[]> => {
        const out: File[] = [];
        for (const { name } of FIXTURES) {
            const res = await fetch(`/__fixtures/${name}`);
            if (!res.ok) {
                setLog(l => [...l, `MISSING /__fixtures/${name}: HTTP ${res.status}`]);
                continue;
            }
            const blob = await res.blob();
            const type = name.endsWith(".png") ? "image/png" : "image/jpeg";
            out.push(new File([blob], name, { type }));
        }
        return out;
    }, []);

    const runJobs = useCallback(async (
        files: File[],
        plan: (f: File) => { format: Format; native?: number }[],
    ) => {
        setRows([]); setLog([]); setJank(null); setBusy(true); setDone(false);

        // Responsiveness probe. Only meaningful in a VISIBLE tab: a hidden tab
        // clamps setInterval to ~1s and fakes a ~1000ms stall.
        let worst = 0, last = performance.now();
        const probe = window.setInterval(() => {
            const now = performance.now();
            worst = Math.max(worst, now - last - 16);
            last = now;
        }, 16);

        const pool = getPool();
        const jobs = files.flatMap(file => plan(file).map(p => ({ file, ...p })));

        await Promise.all(jobs.map(async ({ file, format, native }) => {
            const id = `b${++idRef.current}`;
            try {
                const r = await pool.run({
                    id, file, format,
                    options: { quality, pngMode, nativeOverride: native },
                });
                const bytes = r.bytes.byteLength;
                const canvas = CANVAS.get(file.name) ?? file.size;
                setRows(rs => sortRows([...rs, {
                    file: file.name, format, native: native ?? "curve",
                    originalBytes: file.size, outputBytes: bytes,
                    changePct: +(((bytes - file.size) / file.size) * 100).toFixed(2),
                    vsCanvasPct: +(((bytes - canvas) / canvas) * 100).toFixed(2),
                    beatsCanvas: bytes < canvas,
                    decodeMs: Math.round(r.decodeMs), encodeMs: Math.round(r.encodeMs),
                    kept: isWorthKeeping(file.size, bytes),
                }]));
            } catch (e) {
                setLog(l => [...l, `FAIL ${file.name} -> ${format}${native ? `@${native}` : ""}: ${e instanceof Error ? e.message : String(e)}`]);
            }
        }));

        clearInterval(probe);
        setJank(Math.round(worst));
        setBusy(false);
        setDone(true);
    }, [quality, pngMode]);

    /** The acceptance run: every fixture at the current curve. */
    const runCurve = useCallback(async () => {
        const files = await loadFixtures();
        await runJobs(files, file => {
            const native = formatFromMime(file.type);
            const targets: Format[] = sameFormat
                ? (native ? [native] : [])
                : ([...FORMATS] as Format[]);
            return targets.map(format => ({ format }));
        });
    }, [loadFixtures, runJobs, sameFormat]);

    /** The calibration run: JPEG fixtures across a native quality range. */
    const runSweep = useCallback(async () => {
        const files = (await loadFixtures()).filter(f => f.type === "image/jpeg");
        const range: number[] = [];
        for (let q = sweepFrom; q <= sweepTo; q++) range.push(q);
        await runJobs(files, () => range.map(native => ({ format: "jpeg" as Format, native })));
    }, [loadFixtures, runJobs, sweepFrom, sweepTo]);

    /** The PNG calibration run: PNG fixtures across a native quality range. */
    const runPngSweep = useCallback(async () => {
        const files = (await loadFixtures()).filter(f => f.type === "image/png");
        const range: number[] = [];
        for (let q = sweepFrom; q <= sweepTo; q++) range.push(q);
        await runJobs(files, () => range.map(native => ({ format: "png" as Format, native })));
    }, [loadFixtures, runJobs, sweepFrom, sweepTo]);

    const tsv = rows.map(r =>
        [r.file, r.format, r.native, r.originalBytes, r.outputBytes,
         r.changePct + "%", r.vsCanvasPct + "%", r.beatsCanvas ? "BEATS" : "WORSE",
         r.encodeMs].join("\t")
    ).join("\n");

    const failures = rows.filter(r => !r.beatsCanvas).length;

    return (
        <main style={{ padding: 24, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
            <h1>SmartPress codec benchmark</h1>
            <p>
                Pool size: {typeof navigator !== "undefined" ? Math.min(navigator.hardwareConcurrency || 4, 4) : "?"}
                {" · "}quality {quality}/10 · png {pngMode}
            </p>

            <label style={{ display: "block", margin: "8px 0" }}>
                <input type="checkbox" checked={sameFormat} onChange={e => setSameFormat(e.target.checked)} />
                {" "}same-format only (uncheck to cross-encode every fixture to every format)
            </label>
            <label style={{ display: "block", margin: "8px 0" }}>
                quality {quality}/10{" "}
                <input type="range" min={0} max={10} step={0.01} value={quality}
                       onChange={e => setQuality(parseFloat(e.target.value))} />
            </label>
            <label style={{ display: "block", margin: "8px 0" }}>
                png mode{" "}
                <select value={pngMode} onChange={e => setPngMode(e.target.value as PngMode)}>
                    <option value="lossy">lossy (quantize)</option>
                    <option value="lossless">lossless (effort)</option>
                </select>
            </label>
            <label style={{ display: "block", margin: "8px 0" }}>
                native sweep{" "}
                <input id="sweep-from" type="number" value={sweepFrom} style={{ width: 60 }}
                       onChange={e => setSweepFrom(parseInt(e.target.value) || 0)} />
                {" .. "}
                <input id="sweep-to" type="number" value={sweepTo} style={{ width: 60 }}
                       onChange={e => setSweepTo(parseInt(e.target.value) || 0)} />
            </label>

            <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
                <button id="run-curve" disabled={busy} onClick={runCurve}>
                    Run fixtures at curve
                </button>
                <button id="run-sweep" disabled={busy} onClick={runSweep}>
                    Sweep JPEG native
                </button>
                <button id="run-png-sweep" disabled={busy} onClick={runPngSweep}>
                    Sweep PNG native
                </button>
            </div>

            <input type="file" multiple accept="image/*" disabled={busy}
                   onChange={e => {
                       const fs = e.target.files ? Array.from(e.target.files) : [];
                       runJobs(fs, file => {
                           const native = formatFromMime(file.type);
                           return native ? [{ format: native }] : [];
                       });
                   }} />

            <p id="state">{busy ? "RUNNING" : done ? "COMPLETE" : "IDLE"}</p>
            {jank !== null && <p>worst main-thread stall: <b>{jank} ms</b> (valid only in a visible tab)</p>}
            <p id="summary">rows {rows.length} · not beating canvas: <b>{failures}</b></p>

            <table id="results" cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr>{["file", "fmt", "native", "original", "output", "vs original", "vs canvas", "", "dec ms", "enc ms", "kept?"].map((h, i) =>
                    <th key={i} style={{ borderBottom: "1px solid #999", textAlign: "left" }}>{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.file + r.format + r.native}>
                            <td>{r.file}</td><td>{r.format}</td><td>{r.native}</td>
                            <td>{r.originalBytes}</td><td>{r.outputBytes}</td>
                            <td>{r.changePct}%</td>
                            <td>{r.vsCanvasPct}%</td>
                            <td style={{ color: r.beatsCanvas ? "green" : "crimson" }}>
                                {r.beatsCanvas ? "beats" : "worse"}
                            </td>
                            <td>{r.decodeMs}</td><td>{r.encodeMs}</td>
                            <td>{r.kept ? "keep output" : "keep original"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <pre id="tsv">{tsv}</pre>
            <pre id="log" style={{ color: "crimson" }}>{log.join("\n")}</pre>
        </main>
    );
}
