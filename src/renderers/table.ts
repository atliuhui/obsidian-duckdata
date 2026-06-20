import { Type, DateUnit, TimeUnit, type Table, type Field } from 'apache-arrow';

/**
 * Render an Apache Arrow Table as a read-only HTML table using Obsidian's
 * native table styles.
 *
 * Note: CSV/TSV inputs go through `read_csv_auto(..., ALL_VARCHAR=TRUE)` so
 * every cell arrives as a string. The Date / Timestamp branches in
 * `formatCell` are kept for typed columns from Parquet / JSON sources.
 */
export function renderTable(parent: HTMLElement, table: Table): void {
  const tbl = parent.createEl('table');
  const fields = table.schema.fields;

  const headRow = tbl.createEl('thead').createEl('tr');
  for (const f of fields) {
    headRow.createEl('th', { text: f.name });
  }

  const tbody = tbl.createEl('tbody');
  const rows = table.toArray() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const tr = tbody.createEl('tr');
    for (const f of fields) {
      tr.createEl('td', { text: formatCell(row[f.name], f) });
    }
  }

  if (rows.length === 0) {
    tbody.createEl('tr').createEl('td', {
      text: '(no rows)',
      attr: { colspan: String(fields.length) },
      cls: 'duckdata-status',
    });
  }
}

function formatCell(value: unknown, field: Field): string {
  if (value === null || value === undefined) return '';

  // `Field.type` is generic with an `any` default in apache-arrow, so we narrow
  // it once into a structural shape and drive the rest of the function off that.
  const dataType = field.type as { typeId: number; unit?: DateUnit | TimeUnit };
  const typeId = dataType.typeId;

  if (typeId === Type.Date) {
    const unit = dataType.unit as DateUnit | undefined;
    const ms = unit === DateUnit.DAY
      ? Number(value) * 86400000
      : Number(value);
    return formatDate(new Date(ms));
  }

  if (typeId === Type.Timestamp) {
    const unit = dataType.unit as TimeUnit | undefined;
    const ms = timestampToMs(value, unit);
    return formatDateTime(new Date(ms));
  }

  if (value instanceof Date) {
    return formatDateTime(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function timestampToMs(value: unknown, unit: TimeUnit | undefined): number {
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  switch (unit) {
    case TimeUnit.SECOND:      return n * 1000;
    case TimeUnit.MILLISECOND: return n;
    case TimeUnit.MICROSECOND: return n / 1000;
    case TimeUnit.NANOSECOND:  return n / 1_000_000;
    default:                   return n;
  }
}

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatDateTime(d: Date): string {
  const date = formatDate(d);
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return time === '00:00:00' ? date : `${date} ${time}`;
}
