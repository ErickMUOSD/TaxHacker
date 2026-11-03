import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import sharp from "sharp"
import { afterAll, describe, expect, it } from "vitest"
import { receiptPng } from "./fixtures"
import { enhanceForLLM, isSharpEnough, measureImageSharpness } from "./server"

const tmpRoot = await mkdtemp(path.join(tmpdir(), "th-scanner-"))

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

describe("measureImageSharpness", () => {
  it("accepts a sharp camera JPEG and rejects a blurry one", async () => {
    const sharpPath = path.join(tmpRoot, "sharp.jpg")
    const blurryPath = path.join(tmpRoot, "blurry.jpg")
    await writeFile(sharpPath, await sharp(await receiptPng()).jpeg({ quality: 92 }).toBuffer())
    await writeFile(blurryPath, await sharp(await receiptPng({ blurSigma: 3 })).jpeg({ quality: 92 }).toBuffer())

    const sharpScore = await measureImageSharpness(sharpPath)
    const blurryScore = await measureImageSharpness(blurryPath)
    expect(isSharpEnough(sharpScore)).toBe(true)
    expect(isSharpEnough(blurryScore)).toBe(false)
  })

  it("normalises to the analysis width so a larger capture scores like the phone preview", async () => {
    const small = await receiptPng()
    const large = await sharp(small).resize({ width: 1920 }).png().toBuffer()
    const smallScore = await measureImageSharpness(small)
    const largeScore = await measureImageSharpness(large)
    // Same content, different resolution: scores in the same ballpark, both clearly sharp
    expect(isSharpEnough(largeScore)).toBe(true)
    expect(largeScore / smallScore).toBeGreaterThan(0.3)
  })

  it("handles images with an alpha channel", async () => {
    const withAlpha = await sharp(await receiptPng()).ensureAlpha().png().toBuffer()
    expect(await measureImageSharpness(withAlpha)).toBeGreaterThan(0)
  })
})

describe("enhanceForLLM", () => {
  it("increases contrast of a washed-out receipt", async () => {
    const faded = await sharp(await receiptPng()).linear(0.25, 180).png().toBuffer()
    const enhanced = await enhanceForLLM(faded)
    const before = await sharp(faded).greyscale().stats()
    const after = await sharp(enhanced).greyscale().stats()
    expect(after.channels[0].stdev).toBeGreaterThan(before.channels[0].stdev)
  })
})
