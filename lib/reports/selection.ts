/**
 * Which data goes into the transactions report, remembered per user between downloads.
 *
 * We store the columns the user *unchecked* rather than the checked ones, so fields created after the last
 * download show up checked by default while the user's previous choices are kept.
 */
export const REPORT_SELECTION_SETTING = "report_transactions_selection"

export type ReportSelection = {
  excludedColumns: string[]
  includeAttachments: boolean
}

export const DEFAULT_REPORT_SELECTION: ReportSelection = { excludedColumns: [], includeAttachments: true }

export function parseReportSelection(raw: string | null | undefined): ReportSelection {
  if (!raw) return DEFAULT_REPORT_SELECTION
  try {
    const parsed = JSON.parse(raw)
    return {
      excludedColumns: Array.isArray(parsed?.excludedColumns)
        ? parsed.excludedColumns.filter((code: unknown): code is string => typeof code === "string")
        : [],
      includeAttachments: typeof parsed?.includeAttachments === "boolean" ? parsed.includeAttachments : true,
    }
  } catch {
    return DEFAULT_REPORT_SELECTION
  }
}

/** Keeps only known column codes, in field order. */
export function selectColumns(available: string[], requested: string[]): string[] {
  const wanted = new Set(requested)
  return available.filter((code) => wanted.has(code))
}

/** Characters that are unsafe in a download filename (and in Content-Disposition). */
export function sanitizeReportName(name: string): string {
  return name
    .trim()
    .replace(/\.xlsx$/i, "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}
