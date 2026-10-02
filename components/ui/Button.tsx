import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

/**
 * Three weights (docs/design-system/components/Button.md):
 *  - primary: accent fill. One per screen -- Start, plus Convert inside a nudge.
 *  - secondary: raised fill with a control border (Add files).
 *  - quiet: control border only (Clear list, Show in folder).
 *
 * Sizes: `lg` is the 48px Start button, `md` the default 32px, `sm` the 30px
 * inline button (Convert, Show in folder). Focus ring is global (globals.css).
 */
type Variant = "primary" | "secondary" | "quiet";
type Size = "lg" | "md" | "sm";

const VARIANT: Record<Variant, string> = {
    primary: "bg-accent text-on-accent border border-transparent",
    secondary: "bg-raised text-text border border-control-border",
    quiet: "bg-transparent text-text-muted border border-control-border hover:text-text",
};

const SIZE: Record<Size, string> = {
    lg: "h-12 px-5 rounded-lg text-[15px] leading-5 font-semibold",
    md: "h-8 px-3 rounded-md text-button",
    sm: "h-[30px] px-3 rounded-sm text-button",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
}

export function Button({
    variant = "secondary", size = "md", className, type = "button", ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={clsx(
                "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                VARIANT[variant], SIZE[size], className,
            )}
            {...props}
        />
    );
}
