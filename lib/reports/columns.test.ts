import { describe, expect, it } from "vitest"
import { buildReportColumns, cellValue, ReportField, ReportTransaction, transactionFileIds } from "./columns"
import { reportsConfig } from "./config"

export const FIELDS: ReportField[] = [
  { code: "name", name: "Name", type: "string", isExtra: false },
  { code: "merchant", name: "Merchant", type: "string", isExtra: false },
  { code: "issuedAt", name: "Issued At", type: "string", isExtra: false },
  { code: "categoryCode", name: "Category", type: "string", isExtra: false },
  { code: "projectCode", name: "Project", type: "string", isExtra: false },
  { code: "files", name: "Files", type: "string", isExtra: false },
  { code: "total", name: "Total", type: "number", isExtra: false },
  { code: "currencyCode", name: "Currency", type: "string", isExtra: false },
  { code: "type", name: "Type", type: "string", isExtra: false },
  { code: "text", name: "Detected text", type: "string", isExtra: false },
  { code: "vat_rate", name: "VAT Rate", type: "number", isExtra: true },
  { code: "reimbursable", name: "Reimbursable", type: "boolean", isExtra: true },
  { code: "invoice_no", name: "Invoice #", type: "string", isExtra: true },
]

const tx: ReportTransaction = {
  id: "t1",
  name: "Coffee",
  merchant: "ACME",
  issuedAt: new Date("2026-03-15T00:00:00.000Z"),
  categoryCode: "food",
  category: { name: "Food & Drinks" },
  projectCode: null,
  project: null,
  total: 12345,
  currencyCode: "EUR",
  type: "Expense",
  text: "x".repeat(40000),
  files: ["f1", "f2", 3],
  extra: { vat_rate: "21", reimbursable: "true", invoice_no: "A-17", deleted_field: "orphan value" },
}

const byCode = (code: string) => buildReportColumns(FIELDS).find((c) => c.code === code)!

describe("buildReportColumns", () => {
  it("keeps current fields in order, uses field names as headers and drops `files`", () => {
    const columns = buildReportColumns(FIELDS)
    expect(columns.map((c) => c.header)).toEqual([
      "Name",
      "Merchant",
      "Issued At",
      "Category",
      "Project",
      "Total",
      "Currency",
      "Type",
      "Detected text",
      "VAT Rate",
      "Reimbursable",
      "Invoice #",
    ])
  })

  it("does not create columns for deleted fields even if their values remain in `extra`", () => {
    expect(buildReportColumns(FIELDS).some((c) => c.code === "deleted_field")).toBe(false)
  })

  it("assigns kinds from the fixed column semantics and the field type", () => {
    expect(byCode("total").kind).toBe("money")
    expect(byCode("issuedAt").kind).toBe("date")
    expect(byCode("categoryCode").kind).toBe("category")
    expect(byCode("vat_rate").kind).toBe("number")
    expect(byCode("reimbursable").kind).toBe("boolean")
    expect(byCode("invoice_no").kind).toBe("text")
  })
})

describe("cellValue", () => {
  it("reads fixed fields from the column and extra fields from `extra`", () => {
    expect(cellValue(tx, byCode("merchant"))).toBe("ACME")
    expect(cellValue(tx, byCode("invoice_no"))).toBe("A-17")
  })

  it("converts cents to decimals and keeps dates as Date", () => {
    expect(cellValue(tx, byCode("total"))).toBe(123.45)
    expect(cellValue(tx, byCode("issuedAt"))).toEqual(new Date("2026-03-15T00:00:00.000Z"))
  })

  it("resolves category/project names and lowercases type", () => {
    expect(cellValue(tx, byCode("categoryCode"))).toBe("Food & Drinks")
    expect(cellValue(tx, byCode("projectCode"))).toBeNull()
    expect(cellValue(tx, byCode("type"))).toBe("expense")
  })

  it("coerces typed extra fields", () => {
    expect(cellValue(tx, byCode("vat_rate"))).toBe(21)
    expect(cellValue(tx, byCode("reimbursable"))).toBe(true)
    expect(cellValue({ ...tx, extra: { vat_rate: "n/a" } }, byCode("vat_rate"))).toBe("n/a")
  })

  it("returns null for empty values and when `extra` is missing", () => {
    expect(cellValue({ ...tx, merchant: "" }, byCode("merchant"))).toBeNull()
    expect(cellValue({ ...tx, extra: null }, byCode("invoice_no"))).toBeNull()
  })

  it("truncates text to Excel's cell limit", () => {
    expect((cellValue(tx, byCode("text")) as string).length).toBe(reportsConfig.maxCellTextLength)
  })
})

describe("transactionFileIds", () => {
  it("returns only string ids", () => {
    expect(transactionFileIds(tx)).toEqual(["f1", "f2"])
    expect(transactionFileIds({ ...tx, files: null })).toEqual([])
  })
})
