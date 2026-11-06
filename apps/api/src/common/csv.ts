const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Protege contra CSV injection (fórmulas em Excel/LibreOffice) e faz o
 * escaping de aspas. O prefixo `'` força a célula a ser tratada como texto.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRows(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
