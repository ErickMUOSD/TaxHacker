/**
 * Loads the self-hosted OpenCV.js build (copied to /public by scripts/copy-opencv.mjs)
 * inside a Web Worker. Never fetched from a CDN. Only runs when the camera scanner opens.
 */

// OpenCV.js ships no usable typings for its Emscripten module; keep `any` contained here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCV = any

export const OPENCV_URL = "/vendor/opencv/opencv.js"
const INIT_TIMEOUT_MS = 30_000

type WorkerGlobal = typeof globalThis & { cv?: OpenCV; importScripts?: (...urls: string[]) => void }

/**
 * The Emscripten module is a *thenable* (it has `.then`). Resolving a Promise with it makes JS try to
 * adopt it and the promise never settles, so it is always passed around wrapped in an object.
 */
export type OpenCVHandle = { cv: OpenCV }

let loading: Promise<OpenCVHandle> | null = null

export function loadOpenCV(url: string = OPENCV_URL): Promise<OpenCVHandle> {
  if (!loading) {
    loading = doLoad(url).catch((error) => {
      loading = null
      throw error
    })
  }
  return loading
}

async function doLoad(url: string): Promise<OpenCVHandle> {
  const g = globalThis as WorkerGlobal

  if (!g.cv) {
    let loaded = false
    if (typeof g.importScripts === "function") {
      try {
        // Classic worker: synchronous, sets self.cv
        g.importScripts(url)
        loaded = true
      } catch {
        // Module workers expose importScripts but throw; fall through to fetch + eval
      }
    }
    if (!loaded) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to load OpenCV.js (${response.status})`)
      const source = await response.text()
      // Indirect eval runs in global scope, so the UMD wrapper assigns `cv` onto the worker global
      ;(0, eval)(source)
    }
  }

  if (!g.cv) throw new Error("OpenCV.js did not register a global `cv`")
  return waitForRuntime(g)
}

function waitForRuntime(g: WorkerGlobal): Promise<OpenCVHandle> {
  const candidate = g.cv

  // Some builds export a real Promise that resolves to the module
  if (candidate instanceof Promise) {
    return candidate.then((cv: OpenCV) => {
      g.cv = cv
      return { cv }
    })
  }

  return new Promise((resolve, reject) => {
    const started = Date.now()
    const done = () => {
      clearInterval(timer)
      resolve({ cv: g.cv })
    }
    if (g.cv.Mat) return resolve({ cv: g.cv })
    // Emscripten callback; also poll in case it already fired before we attached
    g.cv.onRuntimeInitialized = done
    const timer = setInterval(() => {
      if (g.cv?.Mat) done()
      else if (Date.now() - started > INIT_TIMEOUT_MS) {
        clearInterval(timer)
        reject(new Error("OpenCV.js runtime initialisation timed out"))
      }
    }, 50)
  })
}
