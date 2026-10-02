"use client";

import { useState, useRef, useEffect, useCallback, DragEvent } from "react";
import {
    Upload, Download, CheckCircle, MinusCircle, X, Image as ImageIcon,
    Settings2, RefreshCw, Clock, Cpu, AlertCircle, Info, FileText,
} from "lucide-react";
import { get, set, del } from "idb-keyval";
import { isWorthKeeping } from "@/lib/compression";
import { getPool, isCancelled, type Stage } from "@/lib/codecs/pool";
import {
    CAPABILITIES, DEFAULT_PNG_MODE, DEFAULT_PRESET, PNG_PRESETS, PRESET_SCALE, formatFromMime,
} from "@/lib/codecs";
import type { Format, PngMode, Preset } from "@/lib/codecs";
import { appError, classify, MAX_INPUT_BYTES, type AppError } from "@/lib/errors";
import { webSaver } from "@/lib/save/web";
import type { SaveAllResult, SaveItem } from "@/lib/save/types";

/**
 * What the dropzone accepts, behind two independent gates.
 *
 * **Gate 1 -- product scope.** Phase 1 hands back the format it was given, so a
 * format is only worth accepting if we would return it unchanged in kind.
 * Conversion is Sprint 2.4. WebP is the reason this list exists rather than
 * being derived: `CAPABILITIES.webp.available` is `true` and WebP encodes
 * correctly today, but exposing it needs a conversion UI, filename handling and
 * a transparency decision, so it stays out until 2.4. Deriving purely from
 * `available` would put it in the dropzone tomorrow.
 *
 * **Gate 2 -- capability.** Whatever survives gate 1 is still filtered on the
 * descriptor, so a format the build cannot encode can never be offered even if
 * someone adds it to the list above. That is the gate that keeps AVIF out today.
 *
 * **Restoring AVIF in Sprint 2.2 is therefore two edits, deliberately:**
 *   1. `available: true` on `CAPABILITIES.avif` -- after fixing the Turbopack
 *      build stall, not instead of fixing it (see `encoders.ts`).
 *   2. add `"avif"` to this list, which is the statement that Phase 2 wants it
 *      offered to users.
 *
 * They are separate because they answer different questions: *can* we encode
 * it, and *should* we offer it. Collapsing them into one flag would take WebP
 * with it.
 *
 * PDF joined this list in Sprint 2.1. It doesn't need a capability gate the
 * way AVIF did -- `lib/codecs/pdf.ts` has no build-time failure mode -- so
 * it's simply always on once added here.
 */
const PHASE1_INPUT_FORMATS: Format[] = ["jpeg", "png", "pdf"];
const ACCEPTED_FORMATS = PHASE1_INPUT_FORMATS.filter(f => CAPABILITIES[f].available !== false);
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
const SETTINGS_KEY = "smartpress:settings:v3";
/**
 * v1 keys, deleted on first load rather than migrated.
 *
 * These are strings to *remove*, not strings the app uses, so a grep sweep for
 * stale v2 or video references must leave them alone -- `smartpress_video_crf`
 * in particular is a dead key from the FFmpeg era, and deleting this line would
 * resurrect it in the stores of everyone who ran that build.
 */
const LEGACY_KEYS = [
    "smartpress_files", "smartpress_image_quality", "smartpress_video_crf",
    // v2 stored a 0-10 `quality` and a PNG-only `pngPreset`; v3 has one `preset`.
    "smartpress:settings:v2",
];

interface Settings {
    /** The one compression control. Mapping lives in lib/codecs/quality.ts. */
    preset: Preset;
    /** PNG only. Lossless ignores the preset. */
    pngMode: PngMode;
    /** PDF only. On (default) keeps levels 1-2; off allows level 3 flatten. */
    keepTextSelectable: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    preset: DEFAULT_PRESET, pngMode: DEFAULT_PNG_MODE, keepTextSelectable: true,
};

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
    /** The encode result, or the original file if it wasn't worth keeping. Handed to lib/save/ verbatim -- this row never creates a Blob URL for it. */
    resultBlob?: Blob;
    error?: AppError;
    originalSize?: number;
    newSize?: number;
    alreadyOptimal?: boolean;
    /** How this row's result was last handed off, once lib/save/ has done it. */
    saved?: "written" | "sent";
    /** PDF only, set once compression completes. */
    pageCount?: number;
    pdfNote?: "signed" | "flatten-not-smaller" | "flatten-failed";
    /** Lossy PNG only. Set when the encode landed below the preset's minimum quality; the original was kept. */
    pngSkip?: { achieved: number; min: number };
    /** Lossy PNG only. A WebP of the same pixels that beats the PNG result enough to offer. */
    webpOffer?: { blob: Blob; savedRatio: number };
    /** Set once the user has swapped the output for the WebP. */
    convertedTo?: "webp";
}

const PRESET_LABEL: Record<Preset, string> = { min: "Min", medium: "Medium", max: "Max" };

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

/** Only files SmartPress actually re-encoded carry the prefix. */
const outputName = (f: FileItem) => {
    if (f.convertedTo === "webp") return `smartpress_${f.file.name.replace(/\.[^./\\]+$/, "")}.webp`;
    return f.alreadyOptimal ? f.file.name : `smartpress_${f.file.name}`;
};

const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// --- Main Component ---

export default function Compressor() {
    const [loaded, setLoaded] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    /** Outcome of the last Download All, for the notice. lib/save/ produced it. */
    const [lastBatch, setLastBatch] = useState<SaveAllResult | null>(null);
    /**
     * The clock, read only inside the effect below and never during render --
     * render must be a pure function of props/state, and `Date.now()` isn't.
     * Starts `null` rather than a render-time `Date.now()` call for the same
     * reason; the effect sets it before anything needs to show elapsed time.
     */
    const [nowMs, setNowMs] = useState<number | null>(null);

    const pool = getPool();

    // --- Object URL lifetime ---
    // The thumbnail preview is the only Blob URL a row owns. The result never
    // gets one here -- it stays a Blob and lib/save/ decides how (or whether)
    // to turn it into a URL, which is what keeps that decision out of this
    // component. Created once and revoked exactly once, on row removal, queue
    // clear, or unmount; never persisted, since a URL from a previous page
    // session is already dead (Patch 1.1a).
    const revokedRef = useRef<Set<string>>(new Set());
    const revoke = useCallback((url?: string) => {
        if (!url || !url.startsWith("blob:")) return;
        if (revokedRef.current.has(url)) return;
        revokedRef.current.add(url);
        URL.revokeObjectURL(url);
    }, []);
    const releaseRow = useCallback((f: FileItem) => {
        revoke(f.preview);
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
                        preset: stored.preset && stored.preset in PRESET_SCALE
                            ? stored.preset : DEFAULT_PRESET,
                        pngMode: stored.pngMode === "lossless" ? "lossless" : DEFAULT_PNG_MODE,
                        keepTextSelectable: typeof stored.keepTextSelectable === "boolean"
                            ? stored.keepTextSelectable : true,
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
        // Not seeded synchronously on entry -- setState directly in an effect
        // body cascades a render. The first tick is at most 500ms away, and
        // until then `elapsed` reads 0, which the label already treats the
        // same as "just started".
        const t = setInterval(() => setNowMs(Date.now()), 500);
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
                // PDF has no preview -- an <img> can't render one, and there's
                // no cheap raster to hand it; the row falls back to an icon.
                preview: supported && !tooBig && format !== "pdf" ? URL.createObjectURL(file) : undefined,
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

        pool.cancel(id);

        setFiles(prev => prev.map(f => f.id === id ? {
            ...f,
            status: "queued", progress: 0, stage: undefined,
            startedAt: Date.now(), error: undefined,
            resultBlob: undefined, newSize: undefined,
            alreadyOptimal: undefined, saved: undefined,
            pageCount: undefined, pdfNote: undefined, pngSkip: undefined,
            webpOffer: undefined, convertedTo: undefined,
        } : f));

        try {
            const result = await pool.run({
                id,
                file: item.file,
                format,
                options: {
                    quality: PRESET_SCALE[settingsRef.current.preset],
                    pngMode: settingsRef.current.pngMode,
                    pngPreset: settingsRef.current.preset,
                    keepTextSelectable: settingsRef.current.keepTextSelectable,
                },
                onProgress: (progress, stage) => setFiles(prev => prev.map(f =>
                    f.id === id ? { ...f, status: "processing", progress, stage } : f)),
            });

            // The keep-original boundary is lib/compression.ts's, not restated
            // here. Below MIN_GAIN_RATIO the encode spent a generation of quality
            // for nothing, so the user gets their own file back. A signed PDF
            // (result.pdfNote === "signed") lands here too: pdf.ts hands back
            // the original bytes untouched, so the gain is zero by construction.
            const outBytes = result.bytes.byteLength;
            // A lossy PNG that landed below its preset's minimum is skipped:
            // the same hand-back as "not worth it", with its own reason.
            const skipped = result.png?.skipped === true;
            const worthIt = !skipped && isWorthKeeping(item.file.size, outBytes);
            const output: Blob = worthIt
                ? new Blob([result.bytes as unknown as BlobPart], { type: cap.mimeType })
                : item.file;

            setFiles(prev => prev.map(f => f.id === id ? {
                ...f,
                status: "done", progress: 100, stage: undefined,
                resultBlob: output,
                originalSize: item.file.size,
                newSize: output.size,
                alreadyOptimal: !worthIt,
                pageCount: result.pageCount,
                pdfNote: result.pdfNote,
                webpOffer: result.webp
                    ? {
                        blob: new Blob([result.webp.bytes as unknown as BlobPart], { type: CAPABILITIES.webp.mimeType }),
                        savedRatio: result.webp.savedRatio,
                    }
                    : undefined,
                pngSkip: skipped && result.png
                    ? { achieved: result.png.achieved, min: result.png.min } : undefined,
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
    }, [pool]);

    /**
     * Swap a PNG row's output for the WebP the nudge offered. Replaces rather
     * than adds: the row has one output, and it is now the WebP under a .webp
     * name. `saved` is cleared because whatever was handed off before is no
     * longer this row's result.
     */
    const convertToWebp = useCallback((id: string) => {
        setFiles(prev => prev.map(f => {
            if (f.id !== id || !f.webpOffer) return f;
            return {
                ...f,
                resultBlob: f.webpOffer.blob,
                newSize: f.webpOffer.blob.size,
                alreadyOptimal: false,
                pngSkip: undefined,
                convertedTo: "webp",
                webpOffer: undefined,
                saved: undefined,
            };
        }));
    }, []);

    const compressAll = useCallback(() => {
        // Dispatched together, not awaited in sequence: the pool is what decides
        // how many run at once, and serialising here would leave it idle.
        filesRef.current
            .filter(f => f.status === "pending")
            .forEach(f => { void compressFile(f.id); });
    }, [compressFile]);

    // --- Save ---
    // Everything below hands off to lib/save/web.ts and does nothing else with
    // the result -- no Blob URL, no anchor, no filesystem call happens in this
    // component. That boundary is what lets a desktop build swap in its own
    // Saver in Sprint 3.3 without touching this file.

    const toSaveItem = useCallback((f: FileItem): SaveItem => ({
        blob: f.resultBlob!,
        filename: outputName(f),
        originalSize: f.originalSize ?? f.file.size,
        newSize: f.newSize ?? f.resultBlob!.size,
        status: f.alreadyOptimal ? "original" : "compressed",
    }), []);

    const saveRow = useCallback(async (id: string) => {
        const item = filesRef.current.find(f => f.id === id);
        if (!item?.resultBlob) return;
        const { outcome } = await webSaver.saveOne(toSaveItem(item));
        if (outcome === "failed") return;
        setFiles(prev => prev.map(f => f.id === id ? { ...f, saved: outcome } : f));
    }, [toSaveItem]);

    /**
     * "Download All", permanent now that ZIP is cancelled. Chromium gets a
     * folder picked once with every file written directly and success known
     * per file; everywhere else falls back to staggered anchor clicks, which
     * report nothing back. Either way every row keeps its own save control,
     * and this only records what lib/save/ tells it -- it never claims a file
     * arrived that it doesn't have a "written" or "sent" outcome for.
     */
    const downloadAll = useCallback(async () => {
        const ready = filesRef.current.filter(f => f.status === "done" && f.resultBlob);
        if (!ready.length) return;
        setLastBatch(null);
        const result = await webSaver.saveAll(ready.map(toSaveItem));
        const outcomeByName = new Map(result.results.map(r => [r.filename, r.outcome]));
        setFiles(prev => prev.map(f => {
            if (f.status !== "done" || !f.resultBlob) return f;
            const outcome = outcomeByName.get(outputName(f));
            if (!outcome) return f;
            // A failed retry must drop any stale "saved" label from an earlier
            // attempt -- otherwise this row would claim success on a run that
            // just failed it.
            return { ...f, saved: outcome === "failed" ? undefined : outcome };
        }));
        setLastBatch(result);
    }, [toSaveItem]);

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
                const elapsed = fileItem.startedAt && nowMs
                    ? Math.max(0, Math.round((nowMs - fileItem.startedAt) / 1000))
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

            case "done": {
                const pageBadge = fileItem.format === "pdf" && fileItem.pageCount ? (
                    <span className="text-xs text-gray-400">
                        {fileItem.pageCount} {fileItem.pageCount === 1 ? "page" : "pages"}
                    </span>
                ) : null;

                if (fileItem.alreadyOptimal) {
                    // Quiet, secondary state: nothing changed, so this must not
                    // read as a successful compression. A signed PDF gets its
                    // own reason -- it was never attempted, not just unhelpful.
                    return (
                        <div className="flex items-center gap-2 mt-2 text-gray-500">
                            <MinusCircle size={14} className="text-gray-400" />
                            <span className="text-sm">
                                {fileItem.pdfNote === "signed"
                                    ? "Signed PDF left unchanged, compressing would break the signature."
                                    : fileItem.pngSkip
                                        ? `Skipped — couldn’t reach the minimum quality for this preset (${fileItem.pngSkip.achieved} < ${fileItem.pngSkip.min}). Original kept.`
                                        : "No size reduction — original kept"}
                            </span>
                            {pageBadge}
                        </div>
                    );
                }
                return (
                    fileItem.originalSize && fileItem.newSize ? (
                        <div className="flex flex-col gap-1 mt-2">
                            <div className="flex items-center gap-2 text-gray-500">
                                <CheckCircle size={14} className="text-green-500" />
                                <span className="text-sm">Compressed</span>
                                <span className="text-sm">→</span>
                                <span className="text-sm font-bold text-green-700">{formatBytes(fileItem.newSize)}</span>
                                <span className="text-xs font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                    -{Math.round((1 - fileItem.newSize / fileItem.originalSize) * 100)}%
                                </span>
                                {pageBadge}
                            </div>
                            {fileItem.pdfNote === "flatten-not-smaller" && (
                                <p className="text-xs text-gray-400 pl-[22px]">
                                    Flattening wouldn&rsquo;t save more — text kept selectable.
                                </p>
                            )}
                            {fileItem.pdfNote === "flatten-failed" && (
                                <p className="text-xs text-amber-600 pl-[22px]">
                                    Flattening failed — text kept selectable.
                                </p>
                            )}
                        </div>
                    ) : null
                );
            }

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
    const anyDone = files.some(f => f.status === "done" && f.resultBlob);
    const anyPdf = files.some(f => f.format === "pdf");

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
                            {dragActive ? "Drop files here" : "Click or drag files to add them"}
                        </p>
                        <p className="text-sm text-gray-400 mt-2 text-center">
                            Images and PDFs ({ACCEPTED_LABEL}) • Multiple files supported
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
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-bold text-gray-700">Compression</legend>
                                <div className="grid grid-cols-3 gap-2">
                                    {(Object.keys(PRESET_SCALE) as Preset[]).map(p => (
                                        <label
                                            key={p}
                                            className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                                                settings.preset === p
                                                    ? "border-blue-600 bg-blue-50 text-blue-700"
                                                    : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"}`}
                                        >
                                            <input
                                                type="radio" name="preset" value={p}
                                                checked={settings.preset === p}
                                                onChange={() => setSettings(s => ({ ...s, preset: p }))}
                                                className="sr-only"
                                            />
                                            {PRESET_LABEL[p]}
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500">
                                    Min keeps the most quality, Max compresses hardest. Applies to JPEG,
                                    images inside PDFs{settings.pngMode === "lossy" ? " and PNG" : ""}.
                                </p>
                                {settings.pngMode === "lossy" && (
                                    <p className="text-xs text-gray-500">
                                        PNG palette quality {PNG_PRESETS[settings.preset].min}–{PNG_PRESETS[settings.preset].max}.
                                        A PNG that can&rsquo;t reach the lower number is skipped and left as-is.
                                    </p>
                                )}
                            </fieldset>

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

                            {anyPdf && (
                                <div className="space-y-2 border-t border-gray-200 pt-4">
                                    <label className="flex items-start gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={settings.keepTextSelectable}
                                            onChange={(e) => setSettings(s => ({ ...s, keepTextSelectable: e.target.checked }))}
                                            className="mt-1 accent-blue-600"
                                        />
                                        <span className="text-sm text-gray-700">
                                            <span className="font-medium">Keep text selectable</span>
                                            <span className="block text-xs text-gray-500">
                                                On (default): PDF text and links stay usable. Off: pages may
                                                also be flattened to images for extra savings, if that would
                                                actually save more — text is no longer selectable or
                                                searchable afterward.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            )}

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
                          What this says depends entirely on which Saver ran. The
                          directory path gets a real per-file result, so a full
                          success is worded as one; the anchor fallback never gets
                          more than "handed to the browser", because that is all it
                          ever knows. Either way every row keeps its own save control.
                        */}
                        {lastBatch && (() => {
                            const { mode, results } = lastBatch;
                            const failed = results.filter(r => r.outcome === "failed");
                            const trivial = mode !== "cancelled" && failed.length === 0 && results.length <= 1;
                            if (trivial) return null;

                            const tone = mode === "cancelled" || failed.length > 0 ? "amber" : "emerald";
                            const colors = tone === "amber"
                                ? { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", text: "text-amber-900", hover: "hover:bg-amber-100", dismiss: "text-amber-700" }
                                : { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", text: "text-emerald-900", hover: "hover:bg-emerald-100", dismiss: "text-emerald-700" };

                            return (
                                <div className={`mb-4 ${colors.bg} border ${colors.border} rounded-lg p-4 flex items-start gap-3`}>
                                    <Info size={16} className={`${colors.icon} mt-0.5 flex-shrink-0`} />
                                    <div className={`flex-1 text-sm ${colors.text}`}>
                                        {mode === "cancelled" ? (
                                            <>
                                                <p className="font-bold">Folder selection was cancelled — nothing was saved.</p>
                                                <p className="mt-1 text-xs leading-relaxed">
                                                    Nothing was written to disk. Use each file&rsquo;s own Download
                                                    button below, or try Download All again.
                                                </p>
                                            </>
                                        ) : mode === "directory" ? (
                                            <>
                                                <p className="font-bold">
                                                    Saved {results.length - failed.length} of {results.length} files to your folder.
                                                </p>
                                                {failed.length > 0 && (
                                                    <p className="mt-1 text-xs leading-relaxed">
                                                        {failed.length} could not be written — use that row&rsquo;s own
                                                        Download button to retry: {failed.map(f => f.filename).join(", ")}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-bold">
                                                    Sent {results.length} files to your browser.
                                                </p>
                                                <p className="mt-1 text-xs leading-relaxed">
                                                    Browsers ask permission before saving several files at once, and
                                                    if that prompt was dismissed the rest were dropped without telling
                                                    this page. Check your downloads folder for the files below —
                                                    anything missing can be downloaded again from its own row.
                                                </p>
                                                <ul className="mt-2 text-xs font-mono space-y-0.5">
                                                    {results.map(r => <li key={r.filename}>{r.filename}</li>)}
                                                </ul>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setLastBatch(null)}
                                        className={`p-1 ${colors.hover} rounded transition flex-shrink-0`}
                                        aria-label="Dismiss"
                                    >
                                        <X size={14} className={colors.dismiss} />
                                    </button>
                                </div>
                            );
                        })()}

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
                                                    {fileItem.format === "pdf"
                                                        ? <FileText className="text-gray-400" size={32} />
                                                        : <ImageIcon className="text-gray-400" size={32} />}
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
                                                {fileItem.status === "done" && fileItem.resultBlob && (
                                                    fileItem.alreadyOptimal ? (
                                                        <button
                                                            onClick={() => saveRow(fileItem.id)}
                                                            className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 transition inline-flex items-center gap-1 font-medium"
                                                        >
                                                            <Download size={12} /> Download original
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => saveRow(fileItem.id)}
                                                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition inline-flex items-center gap-1 font-bold uppercase tracking-wider"
                                                        >
                                                            <Download size={14} /> Download
                                                        </button>
                                                    )
                                                )}
                                                {fileItem.saved && fileItem.status === "done" && (
                                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                                        {fileItem.saved === "written" ? "Saved to folder" : "Sent to downloads"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {fileItem.status === "done" && fileItem.webpOffer && (
                                        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                                            <p className="text-xs text-blue-800">
                                                WebP would save an additional{" "}
                                                <span className="font-bold">{Math.round(fileItem.webpOffer.savedRatio * 100)}%</span>
                                                {" "}— Convert?
                                            </p>
                                            <button
                                                onClick={() => convertToWebp(fileItem.id)}
                                                className="flex-shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition font-bold uppercase tracking-wider"
                                            >
                                                Convert
                                            </button>
                                        </div>
                                    )}
                                    {fileItem.status === "done" && fileItem.convertedTo === "webp" && (
                                        <p className="mt-3 text-xs text-gray-500">Converted to WebP.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
