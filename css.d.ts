// Next.js 15 — unlike 16 — does not ship an ambient declaration for global
// stylesheet side-effect imports, so `import "./globals.css"` fails typecheck
// (TS2882) now that the layout is TypeScript. Declare it ourselves; this mirrors
// exactly what next@16 provides in next/types/global.d.ts. Safe to delete once
// PE.AI is on Next 16.
declare module "*.css" {}
