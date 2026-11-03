/** Limits and layout of the Excel transactions report. */
export const reportsConfig = {
  /** Max transactions per report. Larger ranges are rejected (HTTP 413) to keep memory bounded. */
  maxTransactions: 2000,

  /** Max PDF pages embedded per attached PDF (each page becomes one image). */
  maxPdfPages: 3,

  image: {
    /** Embedded images are re-encoded as JPEG no wider/taller than this (px). Keeps text readable when zooming. */
    maxWidth: 900,
    maxHeight: 1400,
    /** JPEG quality (1–100) of embedded images. */
    jpegQuality: 75,
    /** Height (px) at which images are displayed inside their cell; width follows the aspect ratio. */
    displayHeightPx: 220,
  },

  /** Width (Excel character units, ~7px each) of each "Attachment N" column; wide enough for landscape photos. */
  attachmentColumnWidth: 42,
  /** Width of regular text columns; long text columns get `wideColumnWidth`. */
  columnWidth: 16,
  wideColumnWidth: 40,

  /** Excel's hard limit for characters in a cell. */
  maxCellTextLength: 32767,
} as const
