/**
 * Number formatting for the UI, per docs/design-system/README.md: sizes use two
 * decimals in MB and none in KB (`2.40 MB`, `412 KB`); savings use a true minus
 * and no space (`−83%`).
 */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Fraction saved as `−NN%`. Callers only pass a real saving. */
export function formatSaved(original: number, result: number): string {
    return `−${Math.round((1 - result / original) * 100)}%`;
}
