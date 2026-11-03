import ExcelJS from "exceljs"
import { ReportImage } from "./images"
import { buildReportColumns, cellValue, ReportColumn, ReportField, ReportTransaction, WIDE_TEXT_FIELDS } from "./columns"
import { reportsConfig } from "./config"

export type TransactionAttachments = { images: ReportImage[]; labels: string[] }

export type BuildReportInput = {
  fields: ReportField[]
  transactions: ReportTransaction[]
  /** Attachments per transaction id; missing entries mean "no attachments". */
  attachments: Map<string, TransactionAttachments>
  range: { from: string; to: string }
  generatedAt?: Date
}

const MONEY_FORMAT = "#,##0.00"
const DATE_FORMAT = "yyyy-mm-dd"
const CELL_PADDING_PX = 6

/** Excel column width (characters) → approximate pixels at default font. */
const columnWidthToPx = (width: number) => Math.floor(width * 7 + 5)
/** Pixels → points (row heights are in points). */
const pxToPt = (px: number) => px * 0.75

/**
 * Builds the transactions workbook: one row per transaction, one column per current field,
 * then "Attachment 1..N" columns with embedded images and an "Attachments" file list column.
 */
export async function buildTransactionsReport(input: BuildReportInput): Promise<Buffer> {
  const { fields, transactions, attachments, range } = input
  const columns = buildReportColumns(fields)
  const maxImages = Math.max(0, ...transactions.map((t) => attachments.get(t.id)?.images.length ?? 0))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "TaxHacker"
  workbook.created = input.generatedAt ?? new Date()

  const sheet = workbook.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = [
    ...columns.map((column) => ({
      header: column.header,
      key: column.code,
      width: WIDE_TEXT_FIELDS.has(column.code) ? reportsConfig.wideColumnWidth : reportsConfig.columnWidth,
      style: styleFor(column),
    })),
    ...Array.from({ length: maxImages }, (_, i) => ({
      header: `Attachment ${i + 1}`,
      key: `attachment_${i + 1}`,
      width: reportsConfig.attachmentColumnWidth,
    })),
    { header: "Attachments", key: "__attachments", width: reportsConfig.wideColumnWidth },
  ]

  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: "middle" }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }

  const imageColumnPx = columnWidthToPx(reportsConfig.attachmentColumnWidth) - CELL_PADDING_PX * 2
  const firstImageColumn = columns.length // 0-based index for image anchors

  transactions.forEach((transaction, index) => {
    const values: Record<string, unknown> = {}
    for (const column of columns) values[column.code] = cellValue(transaction, column)
    const files = attachments.get(transaction.id)
    values.__attachments = files?.labels.join("\n") ?? ""

    const row = sheet.addRow(values)
    row.alignment = { vertical: "top", wrapText: true }
    const rowIndex0 = index + 1 // header is row 0 in anchor coordinates

    if (files && files.images.length > 0) {
      let tallest = 0
      files.images.forEach((image, i) => {
        const scale = Math.min(reportsConfig.image.displayHeightPx / image.height, imageColumnPx / image.width, 1)
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        tallest = Math.max(tallest, height)
        const imageId = workbook.addImage({ buffer: image.buffer as unknown as ExcelJS.Buffer, extension: "jpeg" })
        sheet.addImage(imageId, {
          tl: { col: firstImageColumn + i + 0.05, row: rowIndex0 + 0.03 },
          ext: { width, height },
          editAs: "oneCell",
        })
      })
      row.height = pxToPt(tallest + CELL_PADDING_PX * 2)
    }
  })

  addSummarySheet(workbook, transactions, range, input.generatedAt ?? new Date())

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

function styleFor(column: ReportColumn): Partial<ExcelJS.Style> {
  if (column.kind === "money") return { numFmt: MONEY_FORMAT }
  if (column.kind === "date") return { numFmt: DATE_FORMAT }
  return {}
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  transactions: ReportTransaction[],
  range: { from: string; to: string },
  generatedAt: Date
) {
  const sheet = workbook.addWorksheet("Summary")
  sheet.columns = [
    { key: "a", width: 24 },
    { key: "b", width: 18 },
    { key: "c", width: 18 },
    { key: "d", width: 18 },
  ]
  sheet.addRow(["Transactions report"]).font = { bold: true, size: 14 }
  sheet.addRow(["From", range.from])
  sheet.addRow(["To", range.to])
  sheet.addRow(["Transactions", transactions.length])
  sheet.addRow(["Generated at", generatedAt]).getCell(2).numFmt = "yyyy-mm-dd hh:mm"
  sheet.addRow([])

  const totals = new Map<string, { income: number; expense: number }>()
  for (const t of transactions) {
    if (typeof t.total !== "number") continue
    const currency = t.currencyCode || "—"
    const entry = totals.get(currency) ?? { income: 0, expense: 0 }
    if ((t.type || "expense").toLowerCase() === "income") entry.income += t.total
    else entry.expense += t.total
    totals.set(currency, entry)
  }

  sheet.addRow(["Currency", "Income", "Expenses", "Net"]).font = { bold: true }
  for (const [currency, { income, expense }] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const row = sheet.addRow([currency, income / 100, expense / 100, (income - expense) / 100])
    for (const col of [2, 3, 4]) row.getCell(col).numFmt = MONEY_FORMAT
  }
}
