// Ambient declaration for global CSS side-effect imports (e.g.
// `import "./globals.css"` in app/layout.tsx). Next.js 15.5.4's bundled
// `next/types/global.d.ts` only declares `*.module.css`; plain `*.css` needs a
// declaration so `next build`'s typecheck resolves the side-effect import.
// Mirrors the declarations shipped in Next.js 16's next/types/global.d.ts.
// `*.module.css` still takes precedence for CSS Modules (most-specific match).
declare module "*.css" {}
