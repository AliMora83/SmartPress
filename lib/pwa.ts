"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Service worker registration and the update handshake.
 *
 * Registered only in production builds and only for the web target (the desktop
 * build is a Tauri shell and has no use for one). `NEXT_PUBLIC_TARGET` is inlined
 * by next.config.ts; `next dev` never registers, so HMR is never served from cache.
 *
 * There is no automatic skipWaiting. A newly installed worker sits in `waiting`
 * until the user asks for it: `applyUpdate()` posts SKIP_WAITING and the page
 * reloads once the new worker takes control. Whether to *offer* that is the
 * caller's call -- Compressor withholds it while a batch is running.
 */
const ENABLED =
    process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TARGET !== "desktop";

export function useServiceWorkerUpdate() {
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    const reloading = useRef(false);

    useEffect(() => {
        if (!ENABLED || !("serviceWorker" in navigator)) return;
        const sw = navigator.serviceWorker;

        // Only reload for a takeover this tab asked for, so another tab's update
        // can never reload this one mid-batch.
        const onControllerChange = () => {
            if (reloading.current) window.location.reload();
        };
        sw.addEventListener("controllerchange", onControllerChange);

        // A worker only counts as an *update* when one already controls the page;
        // the first install has nothing to replace and needs no prompt.
        const watch = (reg: ServiceWorkerRegistration) => {
            if (reg.waiting && sw.controller) setWaiting(reg.waiting);
            reg.addEventListener("updatefound", () => {
                const next = reg.installing;
                next?.addEventListener("statechange", () => {
                    if (next.state === "installed" && sw.controller) setWaiting(next);
                });
            });
        };
        sw.register("/sw.js", { scope: "/" }).then(watch).catch(() => {
            // No worker means no offline support, not a broken app.
        });

        return () => sw.removeEventListener("controllerchange", onControllerChange);
    }, []);

    const applyUpdate = useCallback(() => {
        if (!waiting) return;
        reloading.current = true;
        waiting.postMessage({ type: "SKIP_WAITING" });
    }, [waiting]);

    return { updateReady: waiting !== null, applyUpdate };
}
