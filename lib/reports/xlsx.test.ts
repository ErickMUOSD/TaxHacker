import ExcelJS from "exceljs"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { ReportImage, toReportJpeg } from "./images"
import { ReportField, ReportTransaction } from "./columns"
import { buildTransactionsReport, TransactionAttachments } from "./xlsx"

const fields: ReportField[] = [
  { code: "name", name: "Name", type: "string", isExtra: false },
  { code: "issuedAt", name: "Issued At", type: "string", isExtra: false },
  { code: "files", name: "Files", type: "string", isExtra: false },
  { code: "total", name: "Total", type: "number", isExtra: false },
  { code: "currencyCode", name: "Currency", type: "string", isExtra: false },
  { code: "type", name: "Type", type: "string", isExtra: false },
  { code: "vat", name: "VAT", type: "number", isExtra: true },
]

const transactions: ReportTransaction[] = [
  { id: "a", name: "No files", issuedAt: new Date("2026-01-05T00:00:00Z"), total: 1000, currencyCode: "EUR", type: "expense", extra: { vat: 2.1 } },
  { id: "b", name: "One photo", issuedAt: new Date("2026-01-10T00:00:00Z"), total: 2550, currencyCode: "EUR", type: "expense", extra: {} },
  { id: "c", name: "Invoice", issuedAt: new Date("2026-01-20T00:00:00Z"), total: 100000, currencyCode: "USD", type: "income", extra: null },
]

async function image(width: number, height: number): Promise<ReportImage> {
  const png = await sharp({ create: { width, height, channels: 3, background: "#f4f1ea" } }).png().toBuffer()
  return toReportJpeg(png)
}

const attachments = new Map<string, TransactionAttachments>([
  ["b", { images: [await image(600, 1200)], labels: ["receipt.jpg"] }],
  ["c", { images: [await image(800, 1100), await image(800, 1100), await image(800, 1100)], labels: ["invoice.pdf (3 pages)"] }],
])

const buffer = await buildTransactionsReport({
  fields,
  transactions,
  attachments,
  range: { from: "2026-01-01", to: "2026-01-31" },
  generatedAt: new Date("2026-02-01T10:00:00Z"),
})

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
const sheet = workbook.getWorksheet("Transactions")!

describe("buildTransactionsReport", () => {
  it("writes one header per current field (no Files) + attachment columns + file list", () => {
    const headers = (sheet.getRow(1).values as unknown[]).slice(1)
    expect(headers).toEqual([
      "Name",
      "Issued At",
      "Total",
      "Currency",
      "Type",
      "VAT",
      "Attachment 1",
      "Attachment 2",
      "Attachment 3",
      "Attachments",
    ])
  })

  it("writes one row per transaction with typed cells", () => {
    expect(sheet.rowCount).toBe(4)
    const row = sheet.getRow(2)
    expect(row.getCell(1).value).toBe("No files")
    expect(row.getCell(2).value).toEqual(new Date("2026-01-05T00:00:00Z"))
    expect(row.getCell(2).numFmt).toBe("yyyy-mm-dd")
    expect(row.getCell(3).value).toBe(10)
    expect(row.getCell(3).numFmt).toBe("#,##0.00")
    expect(row.getCell(6).value).toBe(2.1)
    expect(sheet.getRow(4).getCell(10).value).toBe("invoice.pdf (3 pages)")
  })

  it("embeds every image anchored to its transaction row and attachment column", () => {
    const images = sheet.getImages()
    expect(images).toHaveLength(4)
    const anchors = images
      .map((img) => [Math.floor(img.range.tl.nativeRow), Math.floor(img.range.tl.nativeCol)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    // 0-based: row 2 = transaction "b", row 3 = "c"; attachment columns start at index 6
    expect(anchors).toEqual([
      [2, 6],
      [3, 6],
      [3, 7],
      [3, 8],
    ])
    expect(sheet.getRow(3).height).toBeGreaterThan(100)
  })

  it("adds a summary sheet with totals per currency", () => {
    const summary = workbook.getWorksheet("Summary")!
    const rows = summary.getSheetValues().filter(Boolean).map((r) => (r as unknown[]).slice(1))
    expect(rows).toContainEqual(["Transactions", 3])
    expect(rows).toContainEqual(["EUR", 0, 35.5, -35.5])
    expect(rows).toContainEqual(["USD", 1000, 0, 1000])
  })
})
