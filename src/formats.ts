import type { DataFormat } from './types';

const EXT_FORMAT: Record<string, DataFormat> = {
  csv: 'csv',
  tsv: 'tsv',
  txt: 'csv',
  json: 'json',
  ndjson: 'ndjson',
  jsonl: 'ndjson',
  parquet: 'parquet',
  pq: 'parquet',
};

/** Infer a DuckDB-supported format from a file extension (or URL path). */
export function inferFormat(pathOrUrl: string): DataFormat {
  const clean = pathOrUrl.split(/[?#]/, 1)[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0) {
    throw new Error(`Cannot infer format (no extension) for: ${pathOrUrl}`);
  }
  const ext = clean.slice(dot + 1).toLowerCase();
  const fmt = EXT_FORMAT[ext];
  if (!fmt) {
    throw new Error(`Unsupported file extension ".${ext}" for: ${pathOrUrl}`);
  }
  return fmt;
}

/** Build the DuckDB SELECT expression that reads the registered virtual file. */
export function readerSql(fileName: string, format: DataFormat): string {
  switch (format) {
    case 'csv':
      // ALL_VARCHAR keeps everything as TEXT so the user sees CSV cells verbatim.
      return `SELECT * FROM read_csv_auto('${fileName}', HEADER=TRUE, ALL_VARCHAR=TRUE)`;
    case 'tsv':
      return `SELECT * FROM read_csv_auto('${fileName}', HEADER=TRUE, DELIM='\t', ALL_VARCHAR=TRUE)`;
    case 'json':
      return `SELECT * FROM read_json_auto('${fileName}')`;
    case 'ndjson':
      return `SELECT * FROM read_json_auto('${fileName}', FORMAT='newline_delimited')`;
    case 'parquet':
      return `SELECT * FROM read_parquet('${fileName}')`;
  }
}

/** Filename to register with DuckDB for a given format. */
export function virtualFileName(base: string, format: DataFormat): string {
  const ext = format === 'ndjson' ? 'ndjson' : format;
  return `${base}.${ext}`;
}

/**
 * Wrap the user's SQL so the dataset is exposed as a query-scoped CTE named `data`.
 * - Plain query              → `WITH data AS (<reader>) <user sql>`
 * - User already has WITH    → splice our CTE in as the first one:
 *                              `WITH data AS (<reader>), <user CTEs> SELECT ...`
 *
 * This avoids any shared state between concurrent blocks (each block gets its
 * own virtual file + its own CTE per query).
 */
export function wrapWithDataCte(userSql: string, readerSelect: string): string {
  const head = stripLeadingCommentsAndWs(userSql);
  if (/^with\s/i.test(head.rest)) {
    // Locate `WITH` (optionally followed by `RECURSIVE`) and inject our CTE
    // right after it so the existing CTE list remains valid.
    const m = userSql.match(/^([\s\S]*?)(\bwith\b\s+(?:recursive\s+)?)/i);
    if (m && m.index === 0 && head.consumed === m[1].length) {
      const before = m[1];
      const withKw = m[2];
      const after = userSql.slice(m[0].length);
      return `${before}${withKw}data AS (${readerSelect}), ${after}`;
    }
  }
  return `WITH data AS (${readerSelect}) ${userSql}`;
}

/** Skip leading whitespace + SQL comments, returning what comes after. */
function stripLeadingCommentsAndWs(sql: string): { consumed: number; rest: string } {
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
    } else if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i + 2);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else {
      break;
    }
  }
  return { consumed: i, rest: sql.slice(i) };
}
