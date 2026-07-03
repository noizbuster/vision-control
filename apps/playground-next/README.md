# @vision-control/playground-next

Next.js fixture for dev-only source marker testing (V1 — VC-V1V2-13).

## Structure

- `app/` — app router pages (page.tsx, layout.tsx, client-counter.tsx).
- `pages/` — pages router examples (about.tsx).
- `next.config.mjs` — uses `withVisionControlSourceMarkers` (dev-only).
- `src/production-no-markers.test.ts` — production build negative test (greps
  `.next/` for ZERO `data-vc-source` markers).
- `e2e/next-source-markers.spec.ts` — dev-mode e2e spec (`@next-source-markers`).

## Scripts

```bash
pnpm nx run playground-next:build    # next build (production, zero markers)
pnpm nx run playground-next:test     # production negative marker test
pnpm nx run playground-next:e2e      # dev-mode e2e
```

> Nx tags: platform:browser, type:fixture, scope:playground-next.
