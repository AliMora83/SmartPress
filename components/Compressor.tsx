"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore, DragEvent } from "react";
import Link from "next/link";
import { get, set, del } from "idb-keyval";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { FILE_ROW_GRID, FileRow, type FileRowStatus } from "@/components/ui/FileRow";
import { PresetSelector } from "@/components/ui/PresetSelector";
import { Wordmark } from "@/components/ui/Wordmark";
import { filesFromDrop } from "@/lib/dropEntries";
import { formatSaved, formatSize } from "@/lib/format";
import { isWorthKeeping } from "@/lib/compression";
import { getPool, isCancelled, type Stage } from "@/lib/codecs/pool";
import {
    CAPABILITIES, DEFAULT_PNG_MODE, DEFAULT_PRESET, PRESET_SCALE, formatFromMime,
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

const STAGE_LABEL: Record<Stage, string> = {
    decoding: "Reading image",
    encoding: "Compressing",
};

/** Only files SmartPress actually re-encoded carry the prefix. */
const outputName = (f: FileItem) => {
    if (f.convertedTo === "webp") return `smartpress_${f.file.name.replace(/\.[^./\\]+$/, "")}.webp`;
    return f.alreadyOptimal ? f.file.name : `smartpress_${f.file.name}`;
};

// --- Main Component ---

export default function Compressor({ version }: { version: string }) {
    const [loaded, setLoaded] = useState(false);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [dragActive, setDragActive] = useState(false);
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

    // The result never gets a Blob URL here: it stays a Blob and lib/save/
    // decides how (or whether) to turn it into a URL, which is what keeps that
    // decision out of this component. Rows no longer carry a thumbnail, so
    // there is no object URL to create or revoke at all.

    // Mirror files into a ref so cleanup and batch handlers read current state
    // without re-subscribing on every change.
    const filesRef = useRef<FileItem[]>([]);
    useEffect(() => { filesRef.current = files; }, [files]);

    // Settings likewise: a job dispatched from a chained handler must use the
    // values on screen, not the ones captured when the handler was created.
    const settingsRef = useRef<Settings>(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => () => {
        // Unmount: stop every in-flight encode.
        pool.cancelAll();
    }, [pool]);

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

    const handleFileSelect = useCallback((uploaded: ArrayLike<File> | null) => {
        if (!uploaded?.length) return;
        const added: FileItem[] = Array.from(uploaded).map(file => {
            const format = formatFromMime(file.type);
            const supported = !!format && ACCEPTED_FORMATS.includes(format);
            const tooBig = file.size > MAX_INPUT_BYTES;
            const error = !supported
                ? appError("UNSUPPORTED_FORMAT")
                : tooBig ? appError("FILE_TOO_LARGE", formatSize(file.size)) : undefined;
            return {
                // crypto.randomUUID, not Date.now()-index: two drops inside the
                // same millisecond used to collide and share a row.
                id: crypto.randomUUID(),
                file,
                format: supported ? format : undefined,
                status: error ? "error" : "pending",
                progress: 0,
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

    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        // Drop events bypass the input's accept filter, so validate here too.
        // Folders are walked for their images and PDFs; see lib/dropEntries.ts.
        const accepts = (f: File) => {
            const fmt = formatFromMime(f.type);
            return !!fmt && ACCEPTED_FORMATS.includes(fmt);
        };
        handleFileSelect(await filesFromDrop(e.dataTransfer, accepts));
    };

    const removeFile = useCallback((id: string) => {
        // Cancel first: a wasm encode has no yield point, so the pool terminates
        // the worker running this row rather than letting it finish invisibly.
        pool.cancel(id);
        setFiles(prev => prev.filter(f => f.id !== id));
        setLastBatch(null);
    }, [pool]);

    const clearAll = useCallback(() => {
        pool.cancelAll();
        setFiles([]);
        setLastBatch(null);
    }, [pool]);

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
    const downloadAll = useCallback(async (directory?: FileSystemDirectoryHandle) => {
        const ready = filesRef.current.filter(f => f.status === "done" && f.resultBlob);
        if (!ready.length) return;
        setLastBatch(null);
        const result = await webSaver.saveAll(ready.map(toSaveItem), { directory });
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

    // --- Destination folder ---
    // Held in memory only: a directory handle is not a setting (IndexedDB stores
    // settings and nothing else), and a picker needs a user gesture anyway.
    const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
    // `showDirectoryPicker` is Chromium-only. Read through useSyncExternalStore
    // so the server render and the first client render agree (both `false`).
    const canPickFolder = useSyncExternalStore(
        () => () => {},
        () => typeof window.showDirectoryPicker === "function",
        () => false,
    );

    const pickFolder = useCallback(async () => {
        try {
            setFolder(await window.showDirectoryPicker!({ mode: "readwrite" }));
        } catch {
            // Cancelled, or permission refused: keep whatever was chosen before.
        }
    }, []);

    // When a batch started by Start finishes and a folder is chosen, write the
    // results straight into it. The batch flag is set by Start only, so adding
    // a file or converting a row never triggers a surprise write.
    const batchRef = useRef(false);
    useEffect(() => {
        if (busy || !batchRef.current) return;
        batchRef.current = false;
        // Deferred a tick: downloadAll() resets the previous save notice first,
        // and setState must not run synchronously in an effect body.
        if (folder) queueMicrotask(() => { void downloadAll(folder); });
    }, [busy, folder, downloadAll]);

    const start = useCallback(() => {
        batchRef.current = true;
        compressAll();
    }, [compressAll]);

    // --- Derived view state ---

    const anyPending = files.some(f => f.status === "pending");
    const doneRows = files.filter(f => f.status === "done" && f.resultBlob);
    const anyDone = doneRows.length > 0;
    const inFlight = files.filter(f => f.status === "queued" || f.status === "processing").length;
    const totalOriginal = doneRows.reduce((n, f) => n + (f.originalSize ?? f.file.size), 0);
    const totalResult = doneRows.reduce((n, f) => n + (f.newSize ?? 0), 0);

    const rowProps = (f: FileItem) => {
        const ext = f.convertedTo === "webp"
            ? "webp"
            : f.format ? CAPABILITIES[f.format].extension : (f.file.name.split(".").pop() ?? "").slice(0, 4);
        const badge = ext.toUpperCase();

        let status: FileRowStatus = f.status;
        const notes: string[] = [];
        if (f.status === "error") {
            notes.push(f.error?.message ?? "Compression failed.");
        } else if (f.status === "done") {
            if (f.alreadyOptimal) {
                if (f.pngSkip) {
                    status = "skipped";
                    notes.push(
                        `Skipped — couldn’t reach this preset’s minimum quality (${f.pngSkip.achieved} < ${f.pngSkip.min}). Original kept.`,
                    );
                } else {
                    status = "unchanged";
                    notes.push(f.pdfNote === "signed"
                        ? "Signed PDF left unchanged — compressing would break the signature."
                        : "No size reduction. Original kept.");
                }
            }
            if (f.format === "pdf" && f.pageCount) {
                notes.push(`${f.pageCount} ${f.pageCount === 1 ? "page" : "pages"}`);
            }
            if (f.pdfNote === "flatten-not-smaller") notes.push("Flattening wouldn’t save more — text kept selectable.");
            if (f.pdfNote === "flatten-failed") notes.push("Flattening failed — text kept selectable.");
            if (f.convertedTo === "webp") notes.push("Converted to WebP.");
        }

        const elapsed = f.startedAt && nowMs
            ? Math.max(0, Math.round((nowMs - f.startedAt) / 1000))
            : 0;

        return {
            name: f.file.name,
            badge,
            status,
            originalSize: f.originalSize ?? f.file.size,
            resultSize: f.newSize,
            elapsedSeconds: elapsed,
            stageLabel: STAGE_LABEL[f.stage ?? "decoding"],
            note: notes.join(" · ") || undefined,
            errorRemediation: f.error?.remediation,
            canRetry: f.error?.retryable === true,
            canSave: f.status === "done" && !!f.resultBlob,
            nudgePct: f.status === "done" && f.webpOffer
                ? Math.round(f.webpOffer.savedRatio * 100) : undefined,
            onSave: () => { void saveRow(f.id); },
            onRemove: () => removeFile(f.id),
            onRetry: () => { void compressFile(f.id); },
            onConvert: () => convertToWebp(f.id),
        };
    };

    const presetHint: Record<Preset, string> = {
        min: "Lightest touch. Keeps the most quality.",
        medium: "Balanced size and quality. The default.",
        max: "Smallest files. Fine detail may soften.",
    };

    const saveNotice = (() => {
        if (!lastBatch) return null;
        const failed = lastBatch.results.filter(r => r.outcome === "failed").length;
        const ok = lastBatch.results.length - failed;
        if (lastBatch.mode === "cancelled") return "Save cancelled";
        const where = lastBatch.mode === "directory" ? `to ${folder?.name ?? "folder"}` : "to downloads";
        return `${ok} ${ok === 1 ? "file" : "files"} saved ${where}${failed ? ` · ${failed} failed` : ""}`;
    })();

    // Below lg the page simply flows and scrolls. From lg up it is the ~1120x740
    // window the design describes, with the list and panel scrolling inside.
    return (
        <div className="flex min-h-screen items-center justify-center bg-ground lg:p-6">
            <div className="flex min-h-screen w-full max-w-[1120px] flex-col bg-ground lg:h-[min(740px,calc(100vh-48px))] lg:min-h-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-line">

                {/* Header */}
                <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
                    <Wordmark version={version} />
                    <div className="flex items-center gap-2">
                        <Button variant="quiet" onClick={clearAll} disabled={files.length === 0}>Clear list</Button>
                        <Button variant="secondary" onClick={() => document.getElementById("file-upload")?.click()}>
                            Add files
                        </Button>
                        <input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            accept={ACCEPT_ATTR}
                            multiple
                            onChange={(e) => {
                                handleFileSelect(e.target.files);
                                e.target.value = "";
                            }}
                        />
                    </div>
                </header>

                <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">

                    {/* Main column */}
                    <main className="flex min-h-[320px] min-w-0 flex-1 flex-col gap-4 p-6 lg:min-h-0">
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="Add files"
                            className={clsx(
                                "flex flex-shrink-0 cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed px-5 py-4 transition-colors",
                                dragActive ? "border-control-border bg-raised" : "border-line-strong hover:bg-surface",
                            )}
                            onClick={() => document.getElementById("file-upload")?.click()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    document.getElementById("file-upload")?.click();
                                }
                            }}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <p className="text-body">{dragActive ? "Drop to add" : "Drop files or a folder"}</p>
                            <p className="label-mono text-text-muted">{ACCEPTED_LABEL}</p>
                        </div>

                        {files.length === 0 ? (
                            <div className="flex flex-1 flex-col items-start justify-center gap-2">
                                <h1 className="text-display">Smaller files. Nothing sent.</h1>
                                <p className="text-body text-text-muted">
                                    Everything runs on this device. Drop images or PDFs above to start.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className={clsx(FILE_ROW_GRID, "label-mono flex-shrink-0 px-3 text-text-muted")} aria-hidden="true">
                                    <span>File</span>
                                    <span className="text-right">Original</span>
                                    <span className="text-right">Result</span>
                                    <span className="text-right">Saved</span>
                                    <span />
                                </div>
                                <ul className="-mt-2 flex min-h-0 flex-1 flex-col gap-2 lg:overflow-y-auto">
                                    {files.map(f => <FileRow key={f.id} {...rowProps(f)} />)}
                                </ul>
                            </>
                        )}
                    </main>

                    {/* Settings panel */}
                    <aside className="flex w-full flex-shrink-0 flex-col border-t border-line bg-surface p-5 lg:w-[320px] lg:border-l lg:border-t-0">
                        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:overflow-y-auto">
                            <section>
                                <h2 className="label-mono mb-3 text-text-muted">Compression</h2>
                                <PresetSelector
                                    label="Compression"
                                    options={(Object.keys(PRESET_SCALE) as Preset[]).map(p => ({ value: p, label: PRESET_LABEL[p] }))}
                                    value={settings.preset}
                                    onChange={(preset) => setSettings(s => ({ ...s, preset }))}
                                    hint={presetHint[settings.preset]}
                                />
                            </section>

                            <fieldset>
                                <legend className="label-mono mb-3 text-text-muted">PNG mode</legend>
                                <div className="flex flex-col gap-3">
                                    <Choice
                                        type="radio" name="png-mode" checked={settings.pngMode === "lossy"}
                                        onChange={() => setSettings(s => ({ ...s, pngMode: "lossy" }))}
                                        label="Smaller (palette)" hint="Reduces to a 256-colour palette. Where PNG savings are."
                                    />
                                    <Choice
                                        type="radio" name="png-mode" checked={settings.pngMode === "lossless"}
                                        onChange={() => setSettings(s => ({ ...s, pngMode: "lossless" }))}
                                        label="Lossless" hint="Every pixel kept. Saves far less."
                                    />
                                </div>
                            </fieldset>

                            <section>
                                <h2 className="label-mono mb-3 text-text-muted">PDF</h2>
                                <Choice
                                    type="checkbox" checked={settings.keepTextSelectable}
                                    onChange={(e) => setSettings(s => ({ ...s, keepTextSelectable: e.target.checked }))}
                                    label="Keep PDF text selectable"
                                    hint="Off flattens each page to an image. Smaller, but text and links are lost."
                                />
                            </section>

                            <fieldset>
                                <legend className="label-mono mb-3 text-text-muted">Save to</legend>
                                <div className="flex flex-col gap-3">
                                    <Choice
                                        type="radio" name="save-to" checked={false} disabled
                                        onChange={() => {}}
                                        label="Same as source" hint="Desktop app only. A browser can't write next to the original."
                                    />
                                    <Choice
                                        type="radio" name="save-to" checked readOnly
                                        onChange={() => {}}
                                        label="Choose folder"
                                        hint={canPickFolder
                                            ? (folder ? "Finished files are written here." : "Pick a folder and finished files save there. Otherwise use Save all.")
                                            : "This browser can't write to a folder, so files download instead."}
                                    />
                                    <div className="flex gap-2">
                                        <div
                                            className="data-mono flex h-8 min-w-0 flex-1 items-center rounded-md border border-control-border bg-ground px-3 text-text-muted"
                                            title={folder?.name}
                                        >
                                            <span className="truncate">
                                                {canPickFolder ? (folder?.name ?? "No folder chosen") : "Browser downloads"}
                                            </span>
                                        </div>
                                        <Button variant="quiet" onClick={() => { void pickFolder(); }} disabled={!canPickFolder}>
                                            Browse
                                        </Button>
                                    </div>
                                </div>
                            </fieldset>
                        </div>

                        <Button
                            variant="primary" size="lg" className="mt-5 w-full"
                            onClick={start} disabled={!anyPending}
                        >
                            Start
                        </Button>
                    </aside>
                </div>

                {/* Status bar. "Show in folder" is not here on purpose: a web page
                    cannot open the OS file manager, so it arrives with the desktop
                    build (Sprint 3.3) rather than existing as a button that does
                    nothing. Until then "Save all" is the way out when no folder
                    was chosen. */}
                <footer className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-line px-6 py-2">
                    <p className="data-mono min-w-0 truncate text-text-muted">
                        {inFlight > 0
                            ? `Compressing ${inFlight} of ${files.length}`
                            : anyDone
                                ? <>
                                    {doneRows.length} done {"·"} {formatSize(totalOriginal)} {"→"} {formatSize(totalResult)}
                                    {totalResult < totalOriginal && <> <span className="text-accent">{formatSaved(totalOriginal, totalResult)}</span></>}
                                    {saveNotice && <> {"·"} {saveNotice}</>}
                                </>
                                : files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} ready` : "No files"}
                    </p>
                    <div className="flex flex-shrink-0 items-center gap-4">
                        {anyDone && inFlight === 0 && !folder && (
                            <Button variant="quiet" size="sm" onClick={() => { void downloadAll(); }}>Save all</Button>
                        )}
                        {/* SmartPress is GPLv3 and ships vendored GPL binaries to the
                            browser, so the notices and the source have to be reachable
                            from the running app -- not only from the repository. */}
                        <nav aria-label="Licence" className="label-mono flex gap-3 text-text-muted">
                            <Link href="/licenses" className="hover:text-text">GPLv3</Link>
                            <a href="https://github.com/AliMora83/SmartPress" rel="noopener noreferrer" target="_blank" className="hover:text-text">Source</a>
                            <Link href="/licenses" className="hover:text-text">Notices</Link>
                        </nav>
                    </div>
                </footer>
            </div>
        </div>
    );
}

/**
 * Radio or checkbox row. The native input is visually hidden and a styled box
 * stands in: a control-border outline (never `line`), and no accent -- accent
 * is reserved for Start, the selected preset, savings, progress and focus.
 */
function Choice({
    type, label, hint, className, ...input
}: {
    type: "radio" | "checkbox";
    label: string;
    hint: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
    return (
        <label className={clsx(
            "flex items-start gap-3",
            input.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
            className,
        )}>
            <input type={type} className="peer sr-only" {...input} />
            <span
                aria-hidden="true"
                className={clsx(
                    "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center border border-control-border bg-ground",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                    type === "radio" ? "rounded-full" : "rounded-xs",
                    "peer-checked:[&>span]:opacity-100",
                )}
            >
                <span className={clsx("bg-text opacity-0 transition-opacity", type === "radio" ? "h-2 w-2 rounded-full" : "h-2 w-2 rounded-[1px]")} />
            </span>
            <span className="min-w-0">
                <span className="block text-body">{label}</span>
                <span className="block text-small text-text-muted">{hint}</span>
            </span>
        </label>
    );
}
