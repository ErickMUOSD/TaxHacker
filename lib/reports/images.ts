import sharp from "sharp"
import { reportsConfig } from "./config"

export type ReportImage = { buffer: Buffer; width: number; height: number }

/** Re-encodes any sharp-readable image as a bounded-size JPEG (exceljs embeds only JPEG/PNG/GIF). */
export async function toReportJpeg(input: string | Buffer): Promise<ReportImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: reportsConfig.image.maxWidth,
      height: reportsConfig.image.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: reportsConfig.image.jpegQuality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height }
}
