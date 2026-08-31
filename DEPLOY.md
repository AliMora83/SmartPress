# Deploying SmartPress

SmartPress is a static frontend. There is no backend, no database, and no runtime
environment variables — compression happens entirely in the browser.

## Build

```bash
npm ci
npm run build
```

## Deploy

The build output is a standard Next.js bundle. Any static host or Node host will serve it.
Production target is **namka.cloud** at [smartpress.namka.cloud](https://smartpress.namka.cloud).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, and `npm run lint` on
every push to `main` and on pull requests targeting it. **It does not deploy** — the file
was called `deploy.yml` until Sprint 1.3 and never deployed anything. Deployment is
whatever the host is configured to do with `main`.

## Notes

- **No environment variables are required.** If a deploy asks for one, something has
  regressed.
- **No CDN at runtime.** All wasm encoders are vendored into `/public/wasm/` and loaded
  from local paths — this is what makes the Phase 3 offline mode possible. A deploy that
  introduces a runtime fetch to an external origin is a bug.
- Phase 3 switches `next.config.ts` to `output: 'export'` for a fully static bundle that
  also installs as a PWA. At that point custom headers can no longer be emitted from
  `next.config.ts`, so any header requirement must be handled at the host.
