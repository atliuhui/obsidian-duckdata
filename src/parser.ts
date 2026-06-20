import { parseYaml } from 'obsidian';
import type { DuckDataSpec, DuckDataType } from './types';

const SUPPORTED_TYPES: readonly DuckDataType[] = ['table', 'chart'] as const;

export function parseDuckDataBlock(source: string): DuckDataSpec {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${msg}\n\nHint: YAML reserves a few leading characters in plain scalars ` +
      `(\`@\`, \`#\`, \`*\`, \`&\`, \`!\`, \`%\`, \`>\`, \`|\`). ` +
      `Quote the value, e.g. datasource: "#sales" or datasource: 'Assets/iris.csv'.`,
    );
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('duckdata block must be a YAML mapping with `type` and `sql` keys.');
  }
  const obj = raw as Record<string, unknown>;

  const type = obj.type;
  if (typeof type !== 'string' || !SUPPORTED_TYPES.includes(type as DuckDataType)) {
    throw new Error(
      `Unsupported \`type\`: ${JSON.stringify(type)}. Supported: ${SUPPORTED_TYPES.join(', ')}.`,
    );
  }

  const sql = obj.sql;
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('`sql` is required and must be a non-empty string.');
  }

  const data = obj.data;
  const datasource = obj.datasource;
  if (data !== undefined && datasource !== undefined) {
    throw new Error('Use either `data` or `datasource`, not both.');
  }
  if (data === undefined && datasource === undefined) {
    throw new Error('Provide one of `data` (inline CSV) or `datasource`.');
  }
  if (data !== undefined && typeof data !== 'string') {
    throw new Error('`data` must be a string (CSV text).');
  }
  if (datasource !== undefined && typeof datasource !== 'string') {
    throw new Error('`datasource` must be a string reference.');
  }

  const chart = obj.chart;
  if (type === 'chart') {
    if (chart === undefined || chart === null || typeof chart !== 'object' || Array.isArray(chart)) {
      throw new Error('`chart` is required for `type: chart` and must be a YAML mapping.');
    }
  } else if (chart !== undefined) {
    throw new Error('`chart` is only allowed when `type: chart`.');
  }

  return {
    type: type as DuckDataType,
    sql,
    ...(data !== undefined ? { data } : {}),
    ...(datasource !== undefined ? { datasource } : {}),
    ...(chart !== undefined ? { chart: chart as Record<string, unknown> } : {}),
  };
}
