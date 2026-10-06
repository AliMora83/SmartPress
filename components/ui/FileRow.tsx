import clsx from "clsx";
import { Download, RefreshCw, X } from "lucide-react";
import { formatSaved, formatSize } from "@/lib/format";
import { Button } from "./Button";

/**
 * One row per added file (docs/design-system/components/FileRow.md). Purely
 * presentational: Compressor.tsx owns the state and decides which of these
 * variants a file is in. Nudge is not a state of its own -- it is a done row
 * with `nudgePct` set.
 */
export type FileRowStatus =
    | "pending"      // added, not started
    | "queued"
    | "processing"
    | "done"
    | "skipped"      // original kept, with a reason that is the product working as intended
    | "unchanged"    // original kept because nothing to gain (not a skip)
    | "error"
    | "unsupported"; // not a handled format: listed, never processed

export interface FileRowProps {
    name: string;
    /** Output format badge, e.g. "PNG". */
    badge: string;
    status: FileRowStatus;
    originalSize: number;
    resultSize?: number;
    /** Whole seconds since the encode started. */
    elapsedSeconds?: number;
    /** What the encoder is doing right now, for the processing line. */
    stageLabel?: string;
    /** `small` text-muted line under the row. */
    note?: string;
    /** WebP would save this many additional percent (already past the 10% bar). */
    nudgePct?: number;
    /** Error rows: what happened and what to do. */
    errorRemediation?: string;
    canRetry?: boolean;
    /** Show the save action (done rows with a result). */
    canSave?: boolean;
    onSave?: () => void;
    onRemove: () => void;
    onRetry?: () => void;
    onConvert?: () => void;
}

export const FILE_ROW_GRID = "grid grid-cols-[minmax(0,1fr)_90px_90px_70px_60px] items-center gap-3";

const emDash = "—";

const iconButton = clsx(
    "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-control-border",
    "text-text-muted transition-colors hover:text-text",
);

export function FileRow(p: FileRowProps) {
    const muted = p.status === "queued";
    const showResult = p.status === "done" || p.status === "skipped" || p.status === "unchanged";

    let saved: React.ReactNode = emDash;
    if (p.status === "done" && p.resultSize !== undefined) {
        saved = <span className="font-medium text-accent">{formatSaved(p.originalSize, p.resultSize)}</span>;
    } else if (p.status === "skipped") {
        saved = <span className="text-warn">Skipped</span>;
    } else if (p.status === "unchanged") {
        saved = <span className="text-text-muted">Unchanged</span>;
    } else if (p.status === "error") {
        saved = <span className="text-warn">Failed</span>;
    } else if (p.status === "processing") {
        saved = <span className="text-text-muted">{p.elapsedSeconds ? `${p.elapsedSeconds}s` : emDash}</span>;
    }

    return (
        <li className="list-none rounded-lg border border-line bg-surface px-3 py-3 transition-colors hover:bg-raised">
            <div className={clsx(FILE_ROW_GRID, muted && "text-text-muted")}>
                <div className="flex min-w-0 items-center gap-3">
                    <span className="label-mono rounded-xs border border-line bg-raised px-1.5 text-text-muted">
                        {p.badge}
                    </span>
                    <span className="truncate text-body" title={p.name}>{p.name}</span>
                </div>
                <span className="data-mono text-right text-text-muted">{formatSize(p.originalSize)}</span>
                {p.status === "unsupported" ? (
                    <span className="data-mono col-span-2 text-right text-warn">Not supported</span>
                ) : (
                    <>
                        <span className={clsx("data-mono text-right", !showResult && "text-text-muted")}>
                            {showResult && p.resultSize !== undefined ? formatSize(p.resultSize) : emDash}
                        </span>
                        <span className="data-mono text-right">{saved}</span>
                    </>
                )}
                <div className="flex justify-end gap-1">
                    {p.canSave && (
                        <button type="button" className={iconButton} onClick={p.onSave} aria-label={`Save ${p.name}`}>
                            <Download size={14} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                        </button>
                    )}
                    <button type="button" className={iconButton} onClick={p.onRemove} aria-label={`Remove ${p.name}`}>
                        <X size={14} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    </button>
                </div>
            </div>

            {p.status === "processing" && (
                <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-raised">
                        <div className="smartpress-indeterminate h-full rounded-full bg-accent" />
                    </div>
                    {p.stageLabel && <p className="mt-1 text-small text-text-muted">{p.stageLabel}</p>}
                </div>
            )}

            {p.note && <p className="mt-1 text-small text-text-muted">{p.note}</p>}

            {p.status === "error" && (
                <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-small text-text-muted">{p.errorRemediation}</p>
                    {p.canRetry && (
                        <Button size="sm" variant="quiet" onClick={p.onRetry}>
                            <RefreshCw size={14} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /> Retry
                        </Button>
                    )}
                </div>
            )}

            {p.nudgePct !== undefined && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-accent-tint px-3 py-2">
                    <p className="text-body">
                        WebP would save an additional <span className="data-mono">{p.nudgePct}%</span>
                    </p>
                    <Button size="sm" variant="primary" onClick={p.onConvert}>Convert</Button>
                </div>
            )}
        </li>
    );
}
