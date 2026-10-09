import clsx from "clsx";
import { useRef, type KeyboardEvent } from "react";

/**
 * Three-way segmented control for compression strength
 * (docs/design-system/components/PresetSelector.md). A radiogroup: one tab stop
 * (the selected option), arrow keys move and select, Home/End jump to the ends.
 * One preset drives every
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
    const refs = useRef<(HTMLButtonElement | null)[]>([]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const i = options.findIndex(o => o.value === value);
        let next: number;
        switch (e.key) {
            case "ArrowRight": case "ArrowDown": next = (i + 1) % options.length; break;
            case "ArrowLeft": case "ArrowUp": next = (i - 1 + options.length) % options.length; break;
            case "Home": next = 0; break;
            case "End": next = options.length - 1; break;
            default: return;
        }
        e.preventDefault();
        onChange(options[next].value);
        refs.current[next]?.focus();
    };

    return (
        <div>
            <div
                role="radiogroup"
                onKeyDown={onKeyDown}
                aria-label={label}
                className="flex gap-1 rounded-lg border border-line bg-ground p-1"
            >
                {options.map((o, idx) => {
                    const selected = o.value === value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            ref={el => { refs.current[idx] = el; }}
                            role="radio"
                            aria-checked={selected}
                            tabIndex={selected ? 0 : -1}
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
