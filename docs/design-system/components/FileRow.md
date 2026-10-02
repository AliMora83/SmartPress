A file row is one row per added file. It shows the format badge, name, original size, result size and savings, plus an optional second line.

- **Grid:** four columns, `1fr 90px 90px 70px`, with a `space-3` gap. Numbers are right-aligned in `data` mono. The row uses `bg-surface`, a `line` outline and `radius-lg` corners.
- **Done:** savings shown as `−NN%` in `accent` at weight 500.
- **Nudge:** a second line in `accent-tint` with `radius-md` corners. It reads "WebP would save an additional NN%" with a 30px primary Convert button. It only appears when WebP beats the PNG result by more than 10%.
- **Skipped:** the Saved column reads "Skipped" in `warn`, and the result equals the original. A `small` reason line in `text-muted` follows.
- **Processing:** the Saved column shows a percentage in `text-muted`. Underneath is a 4px progress bar with a `bg-raised` track and `accent` fill.
- **Queued:** no fill, `text-muted` throughout, and the Result column shows an em dash.
