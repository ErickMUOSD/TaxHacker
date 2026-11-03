"use client"

import { FrameMetrics } from "@/lib/scanner/evaluate"
import { Quad } from "@/lib/scanner/geometry"
import { useEffect, useMemo, useRef, useState } from "react"
import type { WorkerRequest, WorkerResponse } from "./protocol"

type Pending = { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export type ScannerWorkerApi = {
  analyze(image: ImageData, track: boolean): Promise<FrameMetrics>
  warp(image: ImageData, quad: Quad, outWidth: number, outHeight: number): Promise<ImageData>
  reset(): Promise<void>
}

/** Bundled by scripts/build-scanner-assets.mjs (predev/prebuild) from ./scanner.worker.ts. */
const SCANNER_WORKER_URL = "/vendor/scanner/scanner.worker.js"

/**
 * Spawns scanner.worker.ts only while `enabled` (i.e. while the camera dialog is open),
 * so OpenCV.js is fetched lazily and its WASM heap is released on close via terminate().
 */
export function useScannerWorker(enabled: boolean) {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(1)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "no-opencv">("idle")

  useEffect(() => {
    if (!enabled) return
    const worker = new Worker(SCANNER_WORKER_URL)
    workerRef.current = worker
    const pending = pendingRef.current

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.type === "error") entry.reject(new Error(msg.error))
      else entry.resolve(msg)
    }
    worker.onerror = (event) => {
      console.error("Scanner worker error:", event.message)
      for (const entry of pending.values()) entry.reject(new Error(event.message || "Scanner worker crashed"))
      pending.clear()
    }

    const id = nextIdRef.current++
    pending.set(id, {
      resolve: (msg) => {
        if (msg.type !== "ready") return
        if (!msg.opencv) console.warn("OpenCV.js unavailable, document detection disabled:", msg.error)
        setStatus(msg.opencv ? "ready" : "no-opencv")
      },
      reject: () => setStatus("no-opencv"),
    })
    setStatus("loading")
    worker.postMessage({ type: "init", id } satisfies WorkerRequest)

    return () => {
      worker.terminate()
      workerRef.current = null
      for (const entry of pending.values()) entry.reject(new Error("Scanner closed"))
      pending.clear()
      setStatus("idle")
    }
  }, [enabled])

  const api = useMemo<ScannerWorkerApi>(() => {
    const send = (message: DistributiveOmit<WorkerRequest, "id">, transfer: Transferable[] = []) =>
      new Promise<WorkerResponse>((resolve, reject) => {
        const worker = workerRef.current
        if (!worker) return reject(new Error("Scanner worker not running"))
        const id = nextIdRef.current++
        pendingRef.current.set(id, { resolve, reject })
        worker.postMessage({ ...message, id }, transfer)
      })

    return {
      async analyze(image, track) {
        const buffer = image.data.buffer as ArrayBuffer
        const res = await send({ type: "analyze", width: image.width, height: image.height, buffer, track }, [buffer])
        if (res.type !== "analyzed") throw new Error("Unexpected worker response")
        return res.metrics
      },
      async warp(image, quad, outWidth, outHeight) {
        const buffer = image.data.buffer as ArrayBuffer
        const res = await send(
          { type: "warp", width: image.width, height: image.height, buffer, quad, outWidth, outHeight },
          [buffer]
        )
        if (res.type !== "warped") throw new Error("Unexpected worker response")
        return new ImageData(new Uint8ClampedArray(res.buffer), res.width, res.height)
      },
      async reset() {
        await send({ type: "reset" })
      },
    }
  }, [])

  return { status, api }
}
