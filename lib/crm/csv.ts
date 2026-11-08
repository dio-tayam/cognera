/** Escapes one CSV cell, including spreadsheet formula characters. */
export function csvCell(value: string | null | undefined): string {
  const raw = value ?? ""
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",\n\r]/.test(neutralized)) return `"${neutralized.replaceAll('"', '""')}"`
  return neutralized
}

export function csvRow(values: Array<string | null | undefined>): string {
  return values.map((value) => csvCell(value)).join(",")
}
