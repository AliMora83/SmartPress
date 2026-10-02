import clsx from "clsx";

/**
 * Three-way segmented control for compression strength
 * (docs/design-system/components/PresetSelector.md). One preset drives every
 * format. The numeric pngquant ranges are deliberately not shown here -- they
 * belong in the log, not the UI.
 */
export interface PresetOption<T extends string> {
    value: T;
    label: string;
}

export function PresetSelector<T extends string>({
    options, value, onChange, hint, label,
}: {
    options: PresetOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** One line describing the selected preset. */
    hint?: string;
    label: string;
}) {
    return (
        <div>
            <div
                role="group"
                aria-label={label}
                className="flex gap-1 rounded-lg border border-line bg-ground p-1"
            >
                {options.map(o => {
                    const selected = o.value === value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange(o.value)}
                            className={clsx(
                                "h-8 flex-1 rounded-md text-button transition-colors",
                                selected
                                    ? "bg-accent font-semibold text-on-accent"
                                    : "bg-transparent font-medium text-text-muted hover:text-text",
                            )}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
            {hint && <p className="mt-2 text-small text-text-muted">{hint}</p>}
        </div>
    );
}
