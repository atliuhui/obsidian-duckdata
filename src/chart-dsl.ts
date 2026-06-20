/**
 * Convert the DuckData chart DSL into a full ECharts option.
 *
 * The DSL is a thin convenience layer over the raw ECharts option model. If the
 * user provides `kind`, we synthesise the matching `series` + axes; everything
 * else in the `chart:` mapping is treated as raw ECharts option keys and is
 * deep-merged on top of the synthesised defaults (user wins for any key they
 * specify, e.g. `tooltip`, `legend`, `title`, `grid`, ...).
 *
 * If `kind` is omitted, the user's chart mapping is treated as a raw ECharts
 * option, with the SQL result injected as the first dataset.
 *
 * Either way, the SQL result is injected as `dataset.source` (rows as objects)
 * and a default `dataset.id = 'data'` so series may reference it via
 * `encode: {x, y}` or `datasetId: 'data'`.
 */

export type ChartRow = Record<string, unknown>;

type Option = Record<string, unknown>;

const AXIS_KINDS = new Set(['bar', 'line', 'area', 'scatter']);

export function buildOption(chartSpec: Record<string, unknown>, rows: ChartRow[]): Option {
  const { kind, ...rest } = chartSpec;

  if (kind === undefined) {
    return mergeWithDataset(rest as Option, rows);
  }

  if (typeof kind !== 'string') {
    throw new Error('`chart.kind` must be a string.');
  }

  const dsl = expandKind(kind, rest as Option, rows);
  return mergeWithDataset(dsl, rows);
}

function expandKind(kind: string, rest: Option, rows: ChartRow[]): Option {
  if (AXIS_KINDS.has(kind)) return expandAxisKind(kind, rest, rows);
  if (kind === 'pie') return expandPie(rest, rows);
  throw new Error(
    `Unsupported \`chart.kind\`: ${JSON.stringify(kind)}. Supported: bar, line, area, scatter, pie. ` +
    `For other chart types omit \`kind\` and write a raw ECharts option.`,
  );
}

function expandAxisKind(kind: string, rest: Option, rows: ChartRow[]): Option {
  const x = pickColumn(rest, 'x', rows, 0);
  const ys = pickColumns(rest, 'y', rows, [1]);
  const seriesCol = typeof rest.series === 'string' ? rest.series : undefined;
  const stack = rest.stack === true;
  const smooth = rest.smooth === true;
  const horizontal = rest.horizontal === true;

  const passthrough = stripDslFields(rest);

  const seriesType = kind === 'area' ? 'line' : kind;
  const seriesBase: Option = { type: seriesType };
  if (kind === 'area') (seriesBase as Record<string, unknown>).areaStyle = {};
  if (kind === 'line' && smooth) (seriesBase as Record<string, unknown>).smooth = true;
  if (stack) (seriesBase as Record<string, unknown>).stack = 'total';

  const categoryAxis: Option = { type: 'category' };
  const valueAxis: Option = { type: 'value' };

  let series: Option[];
  if (seriesCol) {
    const distinct = Array.from(new Set(rows.map((r) => String(r[seriesCol]))));
    series = distinct.map((value, idx) => ({
      ...seriesBase,
      name: value,
      datasetIndex: idx + 1,
      encode: horizontal
        ? { x: ys[0], y: x }
        : { x, y: ys[0] },
    }));
  } else {
    series = ys.map((y) => ({
      ...seriesBase,
      name: y,
      encode: horizontal
        ? { x: y, y: x }
        : { x, y },
    }));
  }

  const option: Option = {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 4 },
    grid: { containLabel: true, left: 8, right: 16, top: 36, bottom: 8 },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  };

  if (seriesCol) {
    const filters = Array.from(new Set(rows.map((r) => String(r[seriesCol])))).map((value) => ({
      transform: { type: 'filter', config: { dimension: seriesCol, eq: value } },
    }));
    (option as Record<string, unknown>).dataset = [{ id: 'data', source: rows }, ...filters];
  }

  return deepMerge(option, passthrough);
}

function expandPie(rest: Option, rows: ChartRow[]): Option {
  const name = pickColumn(rest, 'name', rows, 0);
  const value = pickColumn(rest, 'value', rows, 1);
  const donut = rest.donut === true;
  const passthrough = stripDslFields(rest);

  const option: Option = {
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', top: 4 },
    series: [{
      type: 'pie',
      radius: donut ? ['40%', '70%'] : '70%',
      top: 32,
      encode: { itemName: name, value },
    }],
  };
  return deepMerge(option, passthrough);
}

function mergeWithDataset(option: Option, rows: ChartRow[]): Option {
  const primary = { id: 'data', source: rows };
  const userDataset = option.dataset;
  let dataset: unknown;
  if (Array.isArray(userDataset)) {
    const hasData = userDataset.some(
      (d) => d && typeof d === 'object' && (d as Record<string, unknown>).id === 'data',
    );
    dataset = hasData ? userDataset : [primary, ...userDataset];
  } else if (userDataset && typeof userDataset === 'object') {
    const id = (userDataset as Record<string, unknown>).id;
    dataset = id === 'data' ? [userDataset] : [primary, userDataset];
  } else {
    dataset = [primary];
  }
  return { ...option, dataset };
}

function pickColumn(rest: Option, key: string, rows: ChartRow[], fallbackIndex: number): string {
  const v = rest[key];
  if (typeof v === 'string') return v;
  const cols = rows.length ? Object.keys(rows[0]) : [];
  if (cols.length > fallbackIndex) return cols[fallbackIndex];
  throw new Error(`Cannot infer column for \`${key}\`: result set has ${cols.length} columns.`);
}

function pickColumns(rest: Option, key: string, rows: ChartRow[], fallbackIndices: number[]): string[] {
  const v = rest[key];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const picked = fallbackIndices.map((i) => cols[i]).filter((c): c is string => !!c);
  if (!picked.length) {
    throw new Error(`Cannot infer column(s) for \`${key}\`: result set has ${cols.length} columns.`);
  }
  return picked;
}

const DSL_FIELDS = new Set(['x', 'y', 'series', 'name', 'value', 'kind', 'stack', 'smooth', 'horizontal', 'donut', 'height']);

function stripDslFields(rest: Option): Option {
  const out: Option = {};
  for (const [k, v] of Object.entries(rest)) {
    if (!DSL_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function deepMerge(base: Option, override: Option): Option {
  const out: Option = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const cur = out[k];
    if (
      cur && typeof cur === 'object' && !Array.isArray(cur) &&
      v && typeof v === 'object' && !Array.isArray(v)
    ) {
      out[k] = deepMerge(cur as Option, v as Option);
    } else {
      out[k] = v;
    }
  }
  return out;
}
