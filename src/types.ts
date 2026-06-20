export type DuckDataType = 'table' | 'chart';

export type DataFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet';

export interface DuckDataSpec {
  type: DuckDataType;
  /** Inline CSV body. Mutually exclusive with `datasource`. Markdown blocks are CSV-only. */
  data?: string;
  /** External data source reference. See datasource.ts for accepted forms. */
  datasource?: string;
  /** SQL to run against DuckDB. The inline / loaded data is exposed as a query-scoped CTE named `data`. */
  sql: string;
  /** Chart spec (DSL fields and/or raw ECharts option). Only used when type === 'chart'. */
  chart?: Record<string, unknown>;
}

export interface ResolvedDataSource {
  /** Binary payload to register with DuckDB. Text sources are encoded as UTF-8. */
  bytes: Uint8Array;
  /** File format used to pick the DuckDB reader function. */
  format: DataFormat;
  /** Human-readable label for error messages. */
  origin: string;
}

