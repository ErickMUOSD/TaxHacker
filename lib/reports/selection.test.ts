import { describe, expect, it } from "vitest"
import { DEFAULT_REPORT_SELECTION, parseReportSelection, sanitizeReportName, selectColumns } from "./selection"

describe("parseReportSelection", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(parseReportSelection(undefined)).toEqual(DEFAULT_REPORT_SELECTION)
    expect(parseReportSelection("not json")).toEqual(DEFAULT_REPORT_SELECTION)
  })

  it("keeps only string codes", () => {
    expect(parseReportSelection('{"excludedColumns":["note",3,null],"includeAttachments":false}')).toEqual({
      excludedColumns: ["note"],
      includeAttachments: false,
    })
  })
})

describe("selectColumns", () => {
  it("keeps field order and drops unknown codes", () => {
    expect(selectColumns(["name", "total", "vat"], ["vat", "ghost", "name"])).toEqual(["name", "vat"])
  })
})

describe("sanitizeReportName", () => {
  it("removes unsafe characters and the extension", () => {
    expect(sanitizeReportName('  Q1 "gastos"/2026.xlsx ')).toBe("Q1 _gastos_2026")
  })
})
