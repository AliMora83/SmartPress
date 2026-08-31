"use client";

import { useState, useRef, useEffect, useCallback, DragEvent } from "react";
import {
    Upload, Download, CheckCircle, MinusCircle, X, Image as ImageIcon,
    Settings2, RefreshCw, Clock, Cpu, AlertCircle, Info,
} from "lucide-react";
import { get, set, del } from "idb-keyval";
import { isWorthKeeping } from "@/lib/compression";
import { getPool, isCancelled, type Stage } from "@/lib/codecs/pool";
import { CAPABILITIES, DEFAULT_QUALITY, DEFAULT_PNG_MODE, formatFromMime } from "@/lib/codecs";
import type { Format, PngMode } from "@/lib/codecs";
import { appError, classify, MAX_INPUT_BYTES, type AppError } from "@/lib/errors";

/**
 * Phase 1 hands back the format it was given -- conversion is Sprint 2.4 -- so
 * the accept filter is the set of formats we can both read and write. Deriving
 * it from the capability table rather than a literal list is what keeps an
 * unavailable codec (AVIF today) from ever being offered: Sprint 2.2 restores it
 * by flipping `available`, and nothing here changes.
 */
const INPUT_FORMATS: Format[] = ["jpeg", "png"];
const ACCEPTED_FORMATS = INPUT_FORMATS.filter(f => CAPABILITIES[f].available !== false);
const ACCEPTED_TYPES = ACCEPTED_FORMATS.map(f => CAPABILITIES[f].mimeType);
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");
const ACCEPTED_LABEL = ACCEPTED_FORMATS
    .map(f => CAPABILITIES[f].extension.toUpperCase())
    .join(", ");

/**
 * IndexedDB holds settings and nothing else -- no `File` objects, no previews,
 * no blob URLs, no results. Patch 1.1a traced the download 404s to a restored
 * queue carrying URLs from a dead page session; the fix is that there is no
 * queue to restore.
 *
 * The key is versioned. Bumping it drops v1's stored file items outright rather
 * than half-migrating them, so a stale queue cannot come back.
 */
const SETTINGS_KEY = "smartpress:settings:v2";
const LEGACY_KEYS = ["smartpress_files", "smartpress_image_quality", "smartpress_video_crf"];

interface Settings {
    /** The abstract 0-10 control. Curves live in lib/codecs/quality.ts. */
    quality: number;
    pngMode: PngMode;
}

const DEFAULT_SETTINGS: Settings = { quality: DEFAULT_QUALITY, pngMode: DEFAULT_PNG_MODE };

// --- Types ---

/** Five states, matching the worker pool's lifecycle. */
type FileStatus = "pending" | "queued" | "processing" | "done" | "error";

interface FileItem {
    id: string;
    file: File;
    /** Resolved once, on add. Absent means the file is not something we encode. */
    format?: Format;
    status: FileStatus;
    progress: number;
    stage?: Stage;
    startedAt?: number;
    /** Object URL for the thumbnail. Revoked with the row. */
    preview?: string;
    /** Object URL for the result. One per row, revoked with the row. */
    downloadLink?: string;
    error?: AppError;
    originalSize?: number;
    newSize?: number;
    alreadyOptimal?: boolean;
    /** Whether a download for this row has been handed to the browser. */
    dispatched?: boolean;
}

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: typeof Clock }> = {
    pending: { label: "Ready", color: "#6b7280", icon: Clock },
    queued: { label: "Waiting in queue...", color: "#8b5cf6", icon: Clock },
    processing: { label: "Compressing", color: "#3b82f6", icon: Cpu },
    done: { label: "Done", color: "#10b981", icon: CheckCircle },
    error: { label: "Failed", color: "#ef4444", icon: AlertCircle },
};

const STAGE_LABEL: Record<Stage, string> = {
    decoding: "Reading image",
    encoding: "Compressing",
};

const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// --- Main Component ---

export default function Compressor() {
    const [loaded, setLoaded] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    /** Names handed to the browser by the last Download All, for the notice. */
    const [lastBatch, setLastBatch] = useState<string[] | null>(null);
    /** Ticks only while something is running, so the elapsed counters move. */
    const [, setTick] = useState(0);

    const pool = getPool();

    // --- Object URL lifetime ---
    // Every URL a row owns -- thumbnail and result -- is created once and revoked
    // exactly once, on row removal, queue clear, or unmount. Never during render,
    // or a URL could die between render and click. Never persisted: a URL from a
    // previous page session is already dead (Patch 1.1a).
    const revokedRef = useRef<Set<string>>(new Set());
    const revoke = useCallback((url?: string) => {
        if (!url || !url.startsWith("blob:")) return;
        if (revokedRef.current.has(url)) return;
        revokedRef.current.add(url);
        URL.revokeObjectURL(url);
    }, []);
    const releaseRow = useCallback((f: FileItem) => {
        revoke(f.preview);
        revoke(f.downloadLink);
    }, [revoke]);

    // Mirror files into a ref so cleanup and batch handlers read current state
    // without re-subscribing on every change.
    const filesRef = useRef<FileItem[]>([]);
    useEffect(() => { filesRef.current = files; }, [files]);

    // Settings likewise: a job dispatched from a chained handler must use the
    // values on screen, not the ones captured when the handler was created.
    const settingsRef = useRef<Settings>(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => () => {
        // Unmount: stop every in-flight encode and release every URL.
        pool.cancelAll();
        filesRef.current.forEach(f => releaseRow(f));
    }, [pool, releaseRow]);

    // Restore settings. Nothing here gates the dropzone -- it renders immediately.
    useEffect(() => {
        (async () => {
            try {
                const stored = await get<Partial<Settings>>(SETTINGS_KEY);
                if (stored) {
                    setSettings({
                        quality: typeof stored.quality === "number" ? stored.quality : DEFAULT_QUALITY,
                        pngMode: stored.pngMode === "lossless" ? "lossless" : DEFAULT_PNG_MODE,
                    });
                }
                // Drop v1's keys, which stored whole file items. Doing it here
                // rather than migrating is the point: a restored queue is what
                // produced the 1.1a download 404s.
                await Promise.all(LEGACY_KEYS.map(k => del(k).catch(() => {})));
            } catch {
                // A blocked or unavailable IDB must not stop the app: defaults work.
            }
            setLoaded(true);
        })();
    }, []);

    // Persist settings only. No writes on progress ticks, because progress is
    // not persisted at all.
    useEffect(() => {
        if (!loaded) return;
        set(SETTINGS_KEY, settings).catch(() => {});
    }, [settings, loaded]);

    // Drive the elapsed counters while anything is in flight, and only then.
    const busy = files.some(f => f.status === "processing" || f.status === "queued");
    useEffect(() => {
        if (!busy) return;
        const t = setInterval(() => setTick(n => n + 1), 500);
        return () => clearInterval(t);
    }, [busy]);

    // --- Queue management ---

    const handleFileSelect = useCallback((uploaded: FileList | null) => {
        if (!uploaded?.length) return;
        const added: FileItem[] = Array.from(uploaded).map(file => {
            const format = formatFromMime(file.type);
            const supported = !!format && ACCEPTED_FORMATS.includes(format);
            const tooBig = file.size > MAX_INPUT_BYTES;
            const error = !supported
                ? appError("UNSUPPORTED_FORMAT")
                : tooBig ? appError("FILE_TOO_LARGE", formatBytes(file.size)) : undefined;
            return {
                // crypto.randomUUID, not Date.now()-index: two drops inside the
                // same millisecond used to collide and share a row.
                id: crypto.randomUUID(),
                file,
                format: supported ? format : undefined,
                status: error ? "error" : "pending",
                progress: 0,
                // Object URL, not a base64 data URL: a data URL for a 6 MB photo
                // is an 8 MB string held in state for as long as the row lives.
                preview: supported && !tooBig ? URL.createObjectURL(file) : undefined,
                error,
                originalSize: file.size,
            };
        });
        setFiles(prev => [...prev, ...added]);
    }, []);

    const handleDrag = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        // Drop events bypass the input's accept filter, so validate here too.
        handleFileSelect(e.dataTransfer.files);
    };

    const removeFile = useCallback((id: string) => {
        // Cancel first: a wasm encode has no yield point, so the pool terminates
        // the worker running this row rather than letting it finish invisibly.
        pool.cancel(id);
        const row = filesRef.current.find(f => f.id === id);
        if (row) releaseRow(row);
        setFiles(prev => prev.filter(f => f.id !== id));
        setLastBatch(null);
    }, [pool, releaseRow]);

    const clearAll = useCallback(() => {
        pool.cancelAll();
        filesRef.current.forEach(f => releaseRow(f));
        setFiles([]);
        setLastBatch(null);
    }, [pool, releaseRow]);

    // --- Compression ---

    const compressFile = useCallback(async (id: string) => {
        const item = filesRef.current.find(f => f.id === id);
        if (!item?.format) return;
        const format = item.format;
        const cap = CAPABILITIES[format];

        // Recompressing replaces the result, so release the previous blob first.
        // Done here rather than inside a state updater, which must stay pure.
        revoke(item.downloadLink);
        pool.cancel(id);

        setFiles(prev => prev.map(f => f.id === id ? {
            ...f,
            status: "queued", progress: 0, stage: undefined,
            startedAt: Date.now(), error: undefined,
            downloadLink: undefined, newSize: undefined,
            alreadyOptimal: undefined, dispatched: undefined,
        } : f));

        try {
            const result = await pool.run({
                id,
                file: item.file,
                format,
                options: {
                    quality: settingsRef.current.quality,
                    pngMode: settingsRef.current.pngMode,
                },
                onProgress: (progress, stage) => setFiles(prev => prev.map(f =>
                    f.id === id ? { ...f, status: "processing", progress, stage } : f)),
            });

            // The keep-original boundary is lib/compression.ts's, not restated
            // here. Below MIN_GAIN_RATIO the encode spent a generation of quality
            // for nothing, so the user gets their own file back.
            const outBytes = result.bytes.byteLength;
            const worthIt = isWorthKeeping(item.file.size, outBytes);
            const output: Blob = worthIt
                ? new Blob([result.bytes as unknown as BlobPart], { type: cap.mimeType })
                : item.file;

            setFiles(prev => prev.map(f => f.id === id ? {
                ...f,
                status: "done", progress: 100, stage: undefined,
                downloadLink: URL.createObjectURL(output),
                originalSize: item.file.size,
                newSize: output.size,
                alreadyOptimal: !worthIt,
            } : f));
        } catch (e) {
            // A cancelled row was removed or cleared; there is nothing left to
            // put an error on, and it is not a failure.
            if (isCancelled(e)) return;
            const error = classify(e);
            setFiles(prev => prev.map(f => f.id === id
                ? { ...f, status: "error", progress: 0, stage: undefined, error }
                : f));
        }
    }, [pool, revoke]);

    const compressAll = useCallback(() => {
        // Dispatched together, not awaited in sequence: the pool is what decides
        // how many run at once, and serialising here would leave it idle.
        filesRef.current
            .filter(f => f.status === "pending")
            .forEach(f => { void compressFile(f.id); });
    }, [compressFile]);

    // --- Download ---

    /** Only files SmartPress actually re-encoded carry the prefix. */
    const outputName = (f: FileItem) =>
        f.alreadyOptimal ? f.file.name : `smartpress_${f.file.name}`;

    const dispatchDownload = useCallback((item: FileItem) => {
        if (!item.downloadLink) return;
        const link = document.createElement("a");
        link.href = item.downloadLink;
        link.download = outputName(item);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, dispatched: true } : f));
    }, []);

    /**
     * Staggered per-row downloads. ZIP is Sprint 2.3.
     *
     * The stagger is chained rather than scheduled up front: `setTimeout(fn,
     * i * 300)` for every row at once collapses into simultaneous clicks in a
     * backgrounded tab, because the timers coalesce.
     *
     * The browser tells the page nothing about what happened next -- an anchor
     * click reports no success, no failure, and no permission decision. So this
     * does not claim the files arrived; it records what was handed over and says
     * so, and every row keeps its own download control.
     */
    const downloadAll = useCallback(async () => {
        const ready = filesRef.current.filter(f => f.status === "done" && f.downloadLink);
        if (!ready.length) return;
        setLastBatch(null);
        for (let i = 0; i < ready.length; i++) {
            if (i) await sleep(300);
            // The row may have been removed mid-run; re-read rather than trusting
            // the snapshot, or we click a URL that has already been revoked.
            const live = filesRef.current.find(f => f.id === ready[i].id);
            if (live?.downloadLink) dispatchDownload(live);
        }
        if (ready.length > 1) setLastBatch(ready.map(outputName));
    }, [dispatchDownload]);

    // --- Row rendering ---

    const renderStatusIndicator = (fileItem: FileItem) => {
        const config = STATUS_CONFIG[fileItem.status];

        switch (fileItem.status) {
            case "queued":
                return (
                    <div className="flex items-center gap-2 mt-2">
                        <div className="relative flex h-3 w-3">
                            <span
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ backgroundColor: config.color }}
                            />
                            <span
                                className="relative inline-flex rounded-full h-3 w-3"
                                style={{ backgroundColor: config.color }}
                            />
                        </div>
                        <span className="text-sm font-medium" style={{ color: config.color }}>
                            {config.label}
                        </span>
                    </div>
                );

            case "processing": {
                // These encoders expose no progress callback, so the number is
                // stage-based and would sit at 25% for seconds. An indeterminate
                // bar plus a running clock reads as working; a frozen percentage
                // reads as hung.
                const elapsed = fileItem.startedAt
                    ? Math.max(0, Math.round((Date.now() - fileItem.startedAt) / 1000))
                    : 0;
                const stage = fileItem.stage ?? "decoding";
                return (
                    <div className="mb-2">
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full smartpress-indeterminate"
                                style={{ background: "linear-gradient(90deg, #3b82f6, #6366f1)" }}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.color }}>
                                {STAGE_LABEL[stage]}{elapsed > 0 ? ` · ${elapsed}s` : ""}
                            </p>
                            <Cpu size={12} className="animate-pulse" style={{ color: config.color }} />
                        </div>
                    </div>
                );
            }

            case "done":
                if (fileItem.alreadyOptimal) {
                    // Quiet, secondary state: nothing changed, so this must not
                    // read as a successful compression.
                    return (
                        <div className="flex items-center gap-2 mt-2 text-gray-500">
                            <MinusCircle size={14} className="text-gray-400" />
                            <span className="text-sm">No size reduction — original kept</span>
                        </div>
                    );
                }
                return (
                    fileItem.originalSize && fileItem.newSize ? (
                        <div className="flex items-center gap-2 mt-2 text-gray-500">
                            <CheckCircle size={14} className="text-green-500" />
                            <span className="text-sm">Compressed</span>
                            <span className="text-sm">→</span>
                            <span className="text-sm font-bold text-green-700">{formatBytes(fileItem.newSize)}</span>
                            <span className="text-xs font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                -{Math.round((1 - fileItem.newSize / fileItem.originalSize) * 100)}%
                            </span>
                        </div>
                    ) : null
                );

            case "error":
                return (
                    <div className="flex flex-col gap-2 mt-2">
                        <div className="bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-2">
                            <AlertCircle size={14} className="flex-shrink-0" />
                            <span>{fileItem.error?.message ?? "Compression failed."}</span>
                        </div>
                        {fileItem.error?.remediation && (
                            <div className="bg-blue-50 text-blue-800 text-xs px-3 py-2 rounded-md font-medium border border-blue-100 flex items-start gap-2">
                                <Info size={14} className="mt-0.5 text-blue-600 flex-shrink-0" />
                                <span>{fileItem.error.remediation}</span>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    const anyPending = files.some(f => f.status === "pending");
    const anyDone = files.some(f => f.status === "done" && f.downloadLink);

    return (
        <div className={`w-full h-full ${files.length === 0 ? 'min-h-[50vh] md:min-h-screen flex items-center justify-center' : 'py-6 md:p-12'}`}>
            <div className="w-full max-w-4xl mx-auto space-y-6">

                {/* Upload Area */}
                <div className="space-y-4">
                    <div
                        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${dragActive ? "border-blue-500 bg-blue-50 scale-105" : "border-gray-300 hover:bg-blue-50 hover:border-blue-400"}`}
                        onClick={() => document.getElementById('file-upload')?.click()}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <Upload className={`mb-4 transition-transform ${dragActive ? "scale-125" : ""}`} size={48} color={dragActive ? "#3b82f6" : "#6b7280"} />
                        <p className="text-lg font-medium text-gray-700 text-center">
                            {dragActive ? "Drop files here" : "Click or drag files to upload"}
                        </p>
                        <p className="text-sm text-gray-400 mt-2 text-center">
                            Images ({ACCEPTED_LABEL}) • Multiple files supported
                        </p>
                        <input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            accept={ACCEPT_ATTR}
                            multiple
                            onChange={(e) => handleFileSelect(e.target.files)}
                        />
                    </div>

                    {/* Settings Toggle */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition font-medium"
                        >
                            <Settings2 size={16} /> {showSettings ? "Hide Settings" : "Compression Settings"}
                        </button>
                    </div>

                    {/* Settings Panel */}
                    {showSettings && (
                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 space-y-6">
                            {/*
                              One universal control, per the settled settings shape. It
                              means quality on every lossy path and effort on lossless
                              PNG, so it is never dead and never applies to nothing.
                            */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label htmlFor="quality" className="text-sm font-bold text-gray-700">
                                        Quality
                                    </label>
                                    <span className="text-sm font-mono font-bold text-gray-800 bg-white px-2 py-1 rounded border shadow-sm">
                                        {settings.quality} / 10
                                    </span>
                                </div>
                                <input
                                    id="quality"
                                    type="range" min="0" max="10" step="1"
                                    value={settings.quality}
                                    onChange={(e) => setSettings(s => ({ ...s, quality: parseInt(e.target.value) }))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-[11px] text-gray-700 font-bold tracking-wide">
                                    <span>SMALLEST (0)</span>
                                    <span>BEST (10)</span>
                                </div>
                                {settings.pngMode === "lossless" && (
                                    <p className="text-xs text-gray-500">
                                        For lossless PNG this sets compression effort instead of
                                        quality — there is no quality to trade away.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <span className="text-sm font-bold text-gray-700">PNG mode</span>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-start gap-2 cursor-pointer">
                                        <input
                                            type="radio" name="png-mode" value="lossy"
                                            checked={settings.pngMode === "lossy"}
                                            onChange={() => setSettings(s => ({ ...s, pngMode: "lossy" }))}
                                            className="mt-1 accent-blue-600"
                                        />
                                        <span className="text-sm text-gray-700">
                                            <span className="font-medium">Smaller (palette)</span>
                                            <span className="block text-xs text-gray-500">
                                                Reduces to a 256-colour palette. Where PNG&rsquo;s savings are.
                                            </span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-2 cursor-pointer">
                                        <input
                                            type="radio" name="png-mode" value="lossless"
                                            checked={settings.pngMode === "lossless"}
                                            onChange={() => setSettings(s => ({ ...s, pngMode: "lossless" }))}
                                            className="mt-1 accent-blue-600"
                                        />
                                        <span className="text-sm text-gray-700">
                                            <span className="font-medium">Lossless</span>
                                            <span className="block text-xs text-gray-500">
                                                Every pixel preserved. Saves far less.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 border-t border-gray-200 pt-4">
                                Output keeps the format it came in as.
                            </p>
                        </div>
                    )}
                </div>

                {/* File Queue */}
                {files.length > 0 && (
                    <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800">File Queue ({files.length})</h2>
                            <div className="flex gap-3">
                                {anyPending && (
                                    <button
                                        onClick={compressAll}
                                        className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded transition font-medium"
                                    >
                                        Compress All
                                    </button>
                                )}
                                {anyDone && (
                                    <button
                                        onClick={downloadAll}
                                        className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded transition font-medium"
                                    >
                                        Download All
                                    </button>
                                )}
                                <button
                                    onClick={clearAll}
                                    className="text-sm text-red-500 hover:text-red-700 transition font-medium"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        {/*
                          A multi-file download is handed to the browser one file at a
                          time and the browser reports nothing back -- not success, not
                          the permission prompt, not a refusal. Rather than call that a
                          success, say what was sent and leave every row downloadable.
                        */}
                        {lastBatch && (
                            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                                <Info size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 text-sm text-amber-900">
                                    <p className="font-bold">
                                        Sent {lastBatch.length} files to your browser.
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed">
                                        Browsers ask permission before saving several files at once, and
                                        if that prompt was dismissed the rest were dropped without telling
                                        this page. Check your downloads folder for the files below —
                                        anything missing can be downloaded again from its own row.
                                    </p>
                                    <ul className="mt-2 text-xs font-mono space-y-0.5">
                                        {lastBatch.map(name => <li key={name}>{name}</li>)}
                                    </ul>
                                </div>
                                <button
                                    onClick={() => setLastBatch(null)}
                                    className="p-1 hover:bg-amber-100 rounded transition flex-shrink-0"
                                    aria-label="Dismiss"
                                >
                                    <X size={14} className="text-amber-700" />
                                </button>
                            </div>
                        )}

                        <div className="space-y-3">
                            {files.map(fileItem => (
                                <div key={fileItem.id} className="bg-gray-50 rounded-lg p-4 relative border border-transparent hover:border-gray-200 transition-colors">
                                    <button
                                        onClick={() => removeFile(fileItem.id)}
                                        className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded transition"
                                        aria-label={`Remove ${fileItem.file.name}`}
                                    >
                                        <X size={16} className="text-gray-500" />
                                    </button>

                                    <div className="flex items-start gap-4">
                                        <div className="flex-shrink-0 w-20 h-20 bg-gray-200 rounded overflow-hidden">
                                            {fileItem.preview ? (
                                                /*
                                                 * Plain <img>, deliberately. next/image optimises
                                                 * through a loader that cannot resolve a blob: URL,
                                                 * and there is nothing to optimise anyway -- the
                                                 * bytes are already in memory on this device and
                                                 * never cross the network.
                                                 */
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={fileItem.preview} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ImageIcon className="text-gray-400" size={32} />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <p className="font-bold text-gray-800 truncate">{fileItem.file.name}</p>
                                                <span className="text-xs text-gray-500 flex-shrink-0">
                                                    {formatBytes(fileItem.file.size)}
                                                </span>
                                            </div>

                                            {renderStatusIndicator(fileItem)}

                                            <div className="flex gap-2 mt-2 items-center">
                                                {fileItem.status === "pending" && (
                                                    <button
                                                        onClick={() => compressFile(fileItem.id)}
                                                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition font-bold uppercase tracking-wider"
                                                    >
                                                        Compress
                                                    </button>
                                                )}
                                                {fileItem.status === "error" && fileItem.error?.retryable && (
                                                    <button
                                                        onClick={() => compressFile(fileItem.id)}
                                                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded transition font-bold uppercase tracking-wider inline-flex items-center gap-1"
                                                    >
                                                        <RefreshCw size={12} /> Retry
                                                    </button>
                                                )}
                                                {fileItem.status === "done" && fileItem.downloadLink && (
                                                    fileItem.alreadyOptimal ? (
                                                        <a
                                                            href={fileItem.downloadLink}
                                                            download={outputName(fileItem)}
                                                            onClick={() => setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, dispatched: true } : f))}
                                                            className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 transition inline-flex items-center gap-1 font-medium"
                                                        >
                                                            <Download size={12} /> Download original
                                                        </a>
                                                    ) : (
                                                        <a
                                                            href={fileItem.downloadLink}
                                                            download={outputName(fileItem)}
                                                            onClick={() => setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, dispatched: true } : f))}
                                                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition inline-flex items-center gap-1 font-bold uppercase tracking-wider"
                                                        >
                                                            <Download size={14} /> Download
                                                        </a>
                                                    )
                                                )}
                                                {fileItem.dispatched && fileItem.status === "done" && (
                                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                                        Sent to downloads
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
