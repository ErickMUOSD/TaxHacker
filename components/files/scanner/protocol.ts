import { FrameMetrics } from "@/lib/scanner/evaluate"
import { Quad } from "@/lib/scanner/geometry"

/** Messages between the camera scanner UI and scanner.worker.ts. Pixel buffers are transferred, not copied. */
export type WorkerRequest =
  | { type: "init"; id: number }
  | {
      type: "analyze"
      id: number
      width: number
      height: number
      buffer: ArrayBuffer
      /** When false, frame-to-frame diff is not tracked (e.g. single still photo). */
      track: boolean
    }
  | {
      type: "warp"
      id: number
      width: number
      height: number
      buffer: ArrayBuffer
      quad: Quad
      outWidth: number
      outHeight: number
    }
  | { type: "reset"; id: number }

export type WorkerResponse =
  | { type: "ready"; id: number; opencv: boolean; error?: string }
  | { type: "analyzed"; id: number; metrics: FrameMetrics }
  | { type: "warped"; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: "reset"; id: number }
  | { type: "error"; id: number; error: string }
