import { getCurrentUser } from "@/lib/auth"
import { loadReportAttachments } from "@/lib/reports/attachments"
import { buildReportColumns, transactionFileIds } from "@/lib/reports/columns"
import { reportsConfig } from "@/lib/reports/config"
import { sanitizeReportName, selectColumns } from "@/lib/reports/selection"
import { buildTransactionsReport, TransactionAttachments } from "@/lib/reports/xlsx"
import { getFields } from "@/models/fields"
import { getFilesByIds } from "@/models/files"
import { createReportDownload, saveReportSelection } from "@/models/reports"
import { getTransactions } from "@/models/transactions"
import { NextResponse } from "next/server"
import { z } from "zod"

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, "Invalid date")

const querySchema = z
  .object({
    dateFrom: isoDate,
    dateTo: isoDate,
    /** Comma-separated field codes. Omitted = every field (backwards compatible). */
    columns: z.string().optional(),
    /** "0" excludes the embedded receipts and the file list column. */
    attachments: z.enum(["0", "1"]).optional(),
    name: z.string().max(200).optional(),
  })
  .refine((q) => q.dateFrom <= q.dateTo, { message: "Start date must be before end date" })

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function errorResponse(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status })
}

/**
 * GET /reports/transactions?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD[&columns=a,b][&attachments=0|1][&name=...]
 * → .xlsx with the selected columns. Each successful download is logged in the report history and the
 * selection is remembered for the next time.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues.map((issue) => issue.message).join(", "))
  }
  const { dateFrom, dateTo } = parsed.data
  const includeAttachments = parsed.data.attachments !== "0"
  const name = sanitizeReportName(parsed.data.name ?? "") || `transactions_${dateFrom}_${dateTo}`

  try {
    const [fields, { transactions }] = await Promise.all([
      getFields(user.id),
      getTransactions(user.id, { dateFrom, dateTo, ordering: "issuedAt" }),
    ])

    const availableColumns = buildReportColumns(fields).map((column) => column.code)
    const columns =
      parsed.data.columns === undefined
        ? availableColumns
        : selectColumns(availableColumns, parsed.data.columns.split(",").map((code) => code.trim()))
    if (columns.length === 0) {
      return errorResponse(400, "Select at least one column")
    }

    if (transactions.length === 0) {
      return errorResponse(404, "No transactions with a date in this range")
    }
    if (transactions.length > reportsConfig.maxTransactions) {
      return errorResponse(
        413,
        `This range has ${transactions.length} transactions (max ${reportsConfig.maxTransactions}). Narrow the date range.`
      )
    }

    const attachments = new Map<string, TransactionAttachments>()
    if (includeAttachments) {
      // One query for every attachment in the range, then keep each transaction's own file order
      const files = await getFilesByIds([...new Set(transactions.flatMap(transactionFileIds))], user.id)
      const filesById = new Map(files.map((file) => [file.id, file]))
      for (const transaction of transactions) {
        const transactionFiles = transactionFileIds(transaction)
          .map((id) => filesById.get(id))
          .filter((file) => file !== undefined)
        if (transactionFiles.length > 0) {
          attachments.set(transaction.id, await loadReportAttachments(user, transactionFiles))
        }
      }
    }

    const buffer = await buildTransactionsReport({
      fields,
      transactions,
      attachments,
      columns,
      includeAttachments,
      range: { from: dateFrom, to: dateTo },
    })

    const selected = new Set(columns)
    await Promise.all([
      createReportDownload(user.id, {
        name,
        dateFrom,
        dateTo,
        columns,
        includeAttachments,
        transactionsCount: transactions.length,
      }),
      saveReportSelection(user.id, {
        excludedColumns: availableColumns.filter((code) => !selected.has(code)),
        includeAttachments,
      }),
    ])

    const filename = `${name}.xlsx`
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Failed to build transactions report:", error)
    return errorResponse(500, "Failed to build the report")
  }
}
