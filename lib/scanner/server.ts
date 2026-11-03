import sharp from "sharp"
import { scannerConfig } from "./config"
import { laplacianVariance } from "./metrics"

/**
 * Server-side focus check for camera captures. Decodes with sharp, applies EXIF rotation,
 * converts to greyscale and downsizes to the same `analysisWidth` the browser uses, then runs
 * the shared `laplacianVariance`, so client and server scores are directly comparable.
 */
export async function measureImageSharpness(input: string | Buffer): Promise<number> {
  const { data, info } = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize({ width: scannerConfig.analysisWidth, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return laplacianVariance({ data, width: info.width, height: info.height })
}

export function isSharpEnough(variance: number): boolean {
  return variance >= scannerConfig.sharpness.serverMinVariance
}

/**
 * Optional contrast boost for faded thermal receipts: local adaptive histogram equalisation
 * (CLAHE) followed by a global stretch. Output keeps the input format.
 */
export async function enhanceForLLM(input: string | Buffer): Promise<Buffer> {
  return sharp(input).clahe({ width: 64, height: 64, maxSlope: 3 }).normalise().toBuffer()
}
