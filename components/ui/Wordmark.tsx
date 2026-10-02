/**
 * Lowercase "smartpress" beside the chevron mark
 * (docs/design-system/components/Wordmark.md). "smart" is 400 in text-muted,
 * "press" is 700 in text. Never recolour "press", never capitalise.
 */
export function Wordmark({ version }: { version?: string }) {
    return (
        <div className="flex items-center gap-3">
            <svg
                width="28" height="28" viewBox="0 0 28 28" fill="none"
                aria-hidden="true" className="flex-shrink-0"
            >
                <rect x="1" y="1" width="26" height="26" rx="7" stroke="var(--accent)" strokeWidth="2" />
                <path d="M7 9l5 5-5 5" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 9l-5 5 5 5" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-wordmark" aria-label="smartpress">
                <span className="font-normal text-text-muted">smart</span>
                <span className="font-bold text-text">press</span>
            </span>
            {version && (
                <span className="label-mono whitespace-nowrap rounded-sm border border-line px-2 py-0.5 text-text-muted">
                    v{version}
                </span>
            )}
        </div>
    );
}
