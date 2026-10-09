The preset selector is a three-way segmented control for compression strength: Min, Medium or Max. One preset drives JPEG, PNG, PDF and WebP.

- **Container:** a `bg-ground` well with a `line` outline, `radius-lg` corners and `space-1` padding and gap.
- **Selected segment:** an `accent` fill with `on-accent` text at weight 600, using `aria-checked="true"`.
- **Unselected segments:** transparent with `text-muted` text at weight 500.
- **Hint line:** a single `small` line in `text-muted` under the control describes the selected preset.
- **Ranges:** don't show the numeric ranges (60–80 etc.) in the default UI. They're for the log, not the user.
- **Keyboard:** the container is a `radiogroup` and each segment a `radio`. Only the selected segment is a tab stop; Arrow keys move the selection (wrapping), Home and End jump to Min and Max. Focus shows the global 2px `accent` ring.
