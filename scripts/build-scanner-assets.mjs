// Prepares the camera scanner's self-hosted browser assets under public/vendor/ (no CDN at runtime):
//   1. copies OpenCV.js from node_modules/@techstark/opencv-js
//   2. bundles the scanner Web Worker (components/files/scanner/scanner.worker.ts) with esbuild.
//      Turbopack does not bundle `new Worker(new URL(...))` yet, so the worker is built here as a
//      classic worker script, which lets it load OpenCV with importScripts().
// Runs before `npm run dev` and `npm run build`. Use `--watch` to rebuild the worker on change.
import { build, context } from "esbuild"
import { copyFile, mkdir, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const watch = process.argv.includes("--watch")
const outDir = path.resolve("public/vendor")

async function copyOpenCV() {
  const target = path.join(outDir, "opencv", "opencv.js")
  let source
  try {
    source = path.join(path.dirname(require.resolve("@techstark/opencv-js/package.json")), "dist", "opencv.js")
    await stat(source)
  } catch {
    console.warn("[scanner-assets] @techstark/opencv-js not installed; document detection will be disabled")
    return
  }
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  console.log(`[scanner-assets] opencv.js -> ${path.relative(process.cwd(), target)}`)
}

const workerOptions = {
  entryPoints: ["components/files/scanner/scanner.worker.ts"],
  outfile: path.join(outDir, "scanner", "scanner.worker.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari15"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  tsconfig: "tsconfig.json",
  logLevel: "warning",
}

await copyOpenCV()
if (watch) {
  const ctx = await context(workerOptions)
  await ctx.watch()
  console.log("[scanner-assets] watching scanner worker…")
} else {
  await build(workerOptions)
  console.log(`[scanner-assets] scanner worker -> ${path.relative(process.cwd(), workerOptions.outfile)}`)
}
