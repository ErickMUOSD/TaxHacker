import { describe, expect, it } from "vitest"
import { scannerConfig } from "./config"
import { receiptPng, shiftRight, solidGray, toGray, toRgba } from "./fixtures"
import { laplacianVariance, lightingStats, meanAbsFrameDiff, rgbaToGray } from "./metrics"

const sharpReceipt = await toGray(await receiptPng())
const blurryReceipt = await toGray(await receiptPng({ blurSigma: 3 }))
const slightlyBlurryReceipt = await toGray(await receiptPng({ blurSigma: 1 }))

describe("laplacianVariance (sharpness)", () => {
  it("scores a sharp receipt above the threshold and a blurry one below it", () => {
    const sharp = laplacianVariance(sharpReceipt)
    const blurry = laplacianVariance(blurryReceipt)
    expect(sharp).toBeGreaterThan(scannerConfig.sharpness.minVariance)
    expect(blurry).toBeLessThan(scannerConfig.sharpness.minVariance)
  })

  it("decreases monotonically as blur increases", () => {
    const sharp = laplacianVariance(sharpReceipt)
    const slight = laplacianVariance(slightlyBlurryReceipt)
    const heavy = laplacianVariance(blurryReceipt)
    expect(sharp).toBeGreaterThan(slight)
    expect(slight).toBeGreaterThan(heavy)
  })

  it("is ~0 for a flat image and 0 for images too small to convolve", () => {
    expect(laplacianVariance(solidGray(128))).toBeCloseTo(0)
    expect(laplacianVariance(solidGray(128, 2, 2))).toBe(0)
  })
})

describe("meanAbsFrameDiff (motion)", () => {
  it("is 0 for identical frames", () => {
    expect(meanAbsFrameDiff(sharpReceipt, sharpReceipt)).toBe(0)
  })

  it("stays under the threshold for a 1px jitter and exceeds it for a larger shake", () => {
    expect(meanAbsFrameDiff(sharpReceipt, shiftRight(sharpReceipt, 1))).toBeLessThan(
      scannerConfig.motion.maxFrameDiff
    )
    expect(meanAbsFrameDiff(sharpReceipt, shiftRight(sharpReceipt, 12))).toBeGreaterThan(
      scannerConfig.motion.maxFrameDiff
    )
  })

  it("treats frames of different size as infinite motion", () => {
    expect(meanAbsFrameDiff(solidGray(0, 10, 10), solidGray(0, 20, 10))).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("lightingStats (illumination)", () => {
  const { overexposedLevel, maxOverexposedRatio, minMeanBrightness, maxMeanBrightness } = scannerConfig.lighting

  it("flags a fully blown-out frame as glare", () => {
    const stats = lightingStats(solidGray(255), overexposedLevel)
    expect(stats.overexposedRatio).toBe(1)
    expect(stats.meanBrightness).toBe(255)
  })

  it("flags a dark frame", () => {
    const stats = lightingStats(solidGray(20), overexposedLevel)
    expect(stats.meanBrightness).toBeLessThan(minMeanBrightness)
    expect(stats.overexposedRatio).toBe(0)
  })

  it("passes a normally lit receipt", () => {
    const stats = lightingStats(sharpReceipt, overexposedLevel)
    expect(stats.meanBrightness).toBeGreaterThan(minMeanBrightness)
    expect(stats.meanBrightness).toBeLessThan(maxMeanBrightness)
    expect(stats.overexposedRatio).toBeLessThanOrEqual(maxOverexposedRatio)
  })

  it("only counts pixels strictly above the overexposed level", () => {
    const img = { data: new Uint8Array([250, 251, 100, 255]), width: 2, height: 2 }
    expect(lightingStats(img, 250).overexposedRatio).toBe(0.5)
  })
})

describe("rgbaToGray", () => {
  it("matches sharp's greyscale conversion within ±2 levels", async () => {
    const png = await receiptPng()
    const rgba = await toRgba(png)
    const ours = rgbaToGray(rgba.data, rgba.width, rgba.height)
    let maxDelta = 0
    for (let i = 0; i < ours.data.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(ours.data[i] - sharpReceipt.data[i]))
    }
    expect(maxDelta).toBeLessThanOrEqual(2)
  })
})
