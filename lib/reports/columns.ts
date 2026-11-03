import { reportsConfig } from "./config"

/**
 * Maps the user's *current* Field definitions to report columns.
 *
 * Storage recap: default fields (`isExtra=false`) are real Transaction columns; user-defined fields
 * (`isExtra=true`) live in the `transaction.extra` JSON under the field code. Values of fields that were
 * deleted stay in `extra` but have no Field row anymore, so they intentionally get no column here.
 */

export type ReportField = {
  code: string
  name: string
  type: string
  isExtra: boolean
}

export type ColumnKind = "text" | "number" | "money" | "date" | "boolean" | "category" | "project" | "type"

export type ReportColumn = {
  code: string
  header: string
  kind: ColumnKind
  isExtra: boolean
}

export type ReportTransaction = {
  id: string
  issuedAt: Date | null
  type?: string | null
  total?: number | null
  currencyCode?: string | null
  extra?: unknown
  files?: unknown
  category?: { name: string } | null
  project?: { name: string } | null
  [key: string]: unknown
}

export type CellValue = string | number | boolean | Date | null

/** Fields that are not exported as regular columns (`files` becomes the attachment columns). */
const EXCLUDED_FIELDS = new Set(["files"])
const MONEY_FIELDS = new Set(["total", "convertedTotal"])
/** Columns likely to hold long text, rendered wider. */
export const WIDE_TEXT_FIELDS = new Set(["name", "description", "note", "text", "merchant"])

function kindFor(field: ReportField): ColumnKind {
  if (!field.isExtra) {
    if (MONEY_FIELDS.has(field.code)) return "money"
    if (field.code === "issuedAt") return "date"
    if (field.code === "categoryCode") return "category"
    if (field.code === "projectCode") return "project"
    if (field.code === "type") return "type"
  }
  if (field.type === "number") return "number"
  if (field.type === "boolean") return "boolean"
  return "text"
}

export function buildReportColumns(fields: ReportField[]): ReportColumn[] {
  return fields
    .filter((field) => !EXCLUDED_FIELDS.has(field.code))
    .map((field) => ({ code: field.code, header: field.name, kind: kindFor(field), isExtra: field.isExtra }))
}

function rawValue(transaction: ReportTransaction, column: ReportColumn): unknown {
  if (column.isExtra) {
    const extra = transaction.extra
    if (extra && typeof extra === "object" && !Array.isArray(extra)) {
      return (extra as Record<string, unknown>)[column.code]
    }
    return undefined
  }
  return transaction[column.code]
}

function isBlank(value: unknown) {
  return value === null || value === undefined || value === ""
}

function toText(value: unknown): string {
  const text = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value)
  return text.length > reportsConfig.maxCellTextLength ? text.slice(0, reportsConfig.maxCellTextLength) : text
}

export function cellValue(transaction: ReportTransaction, column: ReportColumn): CellValue {
  switch (column.kind) {
    case "category":
      return transaction.category?.name ?? (transaction.categoryCode as string | null) ?? null
    case "project":
      return transaction.project?.name ?? (transaction.projectCode as string | null) ?? null
  }

  const value = rawValue(transaction, column)
  if (isBlank(value)) return null

  switch (column.kind) {
    case "money": {
      const cents = typeof value === "number" ? value : Number(value)
      return Number.isFinite(cents) ? cents / 100 : null
    }
    case "date": {
      const date = value instanceof Date ? value : new Date(String(value))
      return isNaN(date.getTime()) ? null : date
    }
    case "type":
      return String(value).toLowerCase()
    case "number": {
      const num = typeof value === "number" ? value : Number(String(value).replace(",", "."))
      return Number.isFinite(num) ? num : toText(value)
    }
    case "boolean":
      if (typeof value === "boolean") return value
      if (value === "true" || value === "1" || value === 1) return true
      if (value === "false" || value === "0" || value === 0) return false
      return toText(value)
    default:
      return toText(value)
  }
}

/** File ids attached to a transaction (`files` is a JSON array of File ids). */
export function transactionFileIds(transaction: ReportTransaction): string[] {
  return Array.isArray(transaction.files) ? transaction.files.filter((id): id is string => typeof id === "string") : []
}
