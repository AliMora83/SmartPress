import { Button } from "./Button";

/**
 * "A new version is ready." Quiet by design: neutral surface, secondary button,
 * so it never competes with Start for the one accent fill.
 */
export function UpdateToast({ onReload }: { onReload: () => void }) {
    return (
        <div
            role="status"
            className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-control-border bg-surface px-4 py-3"
        >
            <p className="text-body">Update ready</p>
            <Button size="sm" variant="secondary" onClick={onReload}>Reload</Button>
        </div>
    );
}
