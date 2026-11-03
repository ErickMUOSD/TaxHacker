import { describe, expect, it } from "vitest"
import { scannerConfig } from "./config"
import { createStabilityTracker, evaluateFrame, FrameMetrics } from "./evaluate"
import { defaultQuad } from "./geometry"

const good: FrameMetrics = {
  sharpness: 500,
  frameDiff: 1,
  meanBrightness: 150,
  overexposedRatio: 0,
  quad: defaultQuad(640, 480),
  areaRatio: 0.8,
  analysisWidth: 640,
  analysisHeight: 480,
}

describe("evaluateFrame", () => {
  it("passes when every check is within limits", () => {
    expect(evaluateFrame(good, { accel: 0.1, rotation: 2 })).toEqual({ ok: true, issue: null })
    expect(evaluateFrame(good, null).ok).toBe(true)
  })

  it.each([
    ["motion", { frameDiff: 20 }],
    ["motion", { frameDiff: null }],
    ["no_document", { quad: null, areaRatio: 0 }],
    ["too_far", { areaRatio: scannerConfig.document.minAreaRatio - 0.01 }],
    ["too_dark", { meanBrightness: 10 }],
    ["glare", { overexposedRatio: 0.2 }],
    ["glare", { meanBrightness: 250 }],
    ["blurry", { sharpness: 10 }],
  ] as const)("reports %s", (issue, patch) => {
    expect(evaluateFrame({ ...good, ...patch }, null)).toEqual({ ok: false, issue })
  })

  it("reports device motion from the accelerometer even when frames look still", () => {
    expect(evaluateFrame(good, { accel: 3, rotation: 0 }).issue).toBe("motion")
    expect(evaluateFrame(good, { accel: 0, rotation: 200 }).issue).toBe("motion")
  })

  it("prioritises motion over everything else", () => {
    const bad = { ...good, frameDiff: 50, quad: null, sharpness: 0, meanBrightness: 0 }
    expect(evaluateFrame(bad, null).issue).toBe("motion")
  })
})

describe("createStabilityTracker", () => {
  it("fires once after the condition holds for stableMs", () => {
    const t = createStabilityTracker(400)
    expect(t.update(true, 0)).toBe(false)
    expect(t.update(true, 200)).toBe(false)
    expect(t.progress(200)).toBeCloseTo(0.5)
    expect(t.update(true, 400)).toBe(true)
    expect(t.update(true, 600)).toBe(false)
  })

  it("restarts the timer when a frame fails", () => {
    const t = createStabilityTracker(400)
    t.update(true, 0)
    t.update(true, 350)
    expect(t.update(false, 360)).toBe(false)
    expect(t.update(true, 400)).toBe(false)
    expect(t.update(true, 799)).toBe(false)
    expect(t.update(true, 800)).toBe(true)
  })
})
