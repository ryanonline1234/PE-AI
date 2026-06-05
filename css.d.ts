// Next.js 15 — unlike 16 — ships no ambient declaration for global stylesheet
// side-effect imports, so `import "./globals.css"` fails typecheck (TS2882) once
// the layout is TypeScript. Declare it ourselves (mirrors next@16's global.d.ts).
declare module "*.css" {}
