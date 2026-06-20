# DuckData

Run SQL against the data in your Obsidian notes — inline CSV, markdown tables,
vault files (CSV / TSV / JSON / Parquet), or remote URLs — and render the result
as a table or ECharts visualization inside a code block. Powered by
[DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview).

> Desktop only. The plugin loads the DuckDB-WASM worker and `.wasm` module from
> a CDN (configurable in settings); queries then run entirely on your machine —
> no data leaves your vault.

## Quick start

Inline CSV:

````markdown
```duckdata
type: table
data: |
  date,amount
  2026-06-01,100
  2026-06-02,120
sql: |
  SELECT date, SUM(amount::INT) AS total
  FROM data
  WHERE amount::INT > 100
  GROUP BY date
```
````

Reference a table elsewhere via `datasource` (quote values that begin with
YAML reserved characters such as `#`, `@`, `*`, `&`, `!`):

````markdown
<!-- duckdata:table id=sales -->

| date       | amount |
| ---------- | ------ |
| 2026-06-01 | 100    |
| 2026-06-02 | 120    |

```duckdata
type: table
datasource: "#sales"
sql: SELECT * FROM data WHERE amount::INT > 100
```
````

`datasource` accepts:

| Form                              | Meaning                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `#id`                             | Anchor `<!-- duckdata:table id=ID -->` above a table in the current note  |
| `path/to/note.md#id`              | Anchor in another vault note                                              |
| `path/to/file.{csv,tsv,json,ndjson,parquet}` | File in the vault                                              |
| `https://example.com/x.parquet`   | Remote file; format inferred from URL extension                           |

Markdown-embedded sources (inline `data` and anchor tables) are **CSV only**.
File and URL sources support any DuckDB-readable format
(`.csv`, `.tsv`, `.json`, `.ndjson` / `.jsonl`, `.parquet`).

The loaded dataset is exposed as a query-scoped CTE named `data` — your SQL is
rewritten to `WITH data AS (<reader>) <your sql>` (or spliced into your own
`WITH` clause). Each block is fully isolated, so multiple blocks in the same
note can run in parallel without interfering.

CSV / TSV cells are read with `ALL_VARCHAR=TRUE`, i.e. **every column is text**.
Cast explicitly when you need numeric / date semantics, e.g. `amount::INT > 100`
or `CAST(date AS DATE) >= DATE '2026-06-01'`.

`type` supports `table` (read-only data table) and `chart` (ECharts visualization).

## Charts

`type: chart` renders the result via [Apache ECharts](https://echarts.apache.org/).
A small DSL covers common cases; otherwise any field is passed through as a raw
ECharts option (deep-merged with the dataset of query rows).

Casting matters: CSV cells are strings — `CAST(... AS INT/DOUBLE)` numeric
columns in your SQL so axes and tooltips behave.

DSL example (bar chart grouped by a category column):

````markdown
```duckdata
type: chart
data: |
  month,product,sales
  2026-01,A,100
  2026-01,B,80
  2026-02,A,140
  2026-02,B,90
sql: |
  SELECT month, product, sales::INT AS sales FROM data
chart:
  kind: bar
  x: month
  y: sales
  series: product
  stack: true
  height: 320
```
````

Supported `kind`: `bar`, `line`, `area`, `scatter`, `pie`.
DSL fields: `kind`, `x`, `y` (string or array), `series` (group-by column),
`stack`, `smooth` (line), `horizontal` (swap axes), `donut` (pie), `height` (px,
default 300). Anything else is merged into the underlying ECharts option, so you
can set `title`, `legend`, `tooltip`, `visualMap`, etc.

Raw passthrough example (any chart kind ECharts supports):

````markdown
```duckdata
type: chart
data: |
  name,value
  apple,10
  pear,30
  plum,18
sql: SELECT name, value::INT AS value FROM data
chart:
  tooltip: {}
  series:
    - type: pie
      radius: ['40%', '70%']
      encode: { itemName: name, value: value }
  height: 280
```
````

Registered chart kinds in this build: **all 22 built-in ECharts series** —
`bar`, `line`, `scatter`, `effectScatter`, `candlestick`, `boxplot`, `heatmap`,
`pictorialBar`, `lines`, `pie`, `funnel`, `gauge`, `tree`, `treemap`, `sunburst`,
`graph`, `sankey`, `radar`, `parallel`, `map`, `themeRiver`, `custom`.

## Settings

Open **Settings → Community plugins → DuckData** to configure:

| Setting              | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| CDN mirror           | `jsDelivr` (default), `unpkg`, or a custom URL (e.g. internal mirror). Supports `{version}` placeholder. |
| DuckDB memory limit  | Applied as `PRAGMA memory_limit`. `0` keeps the engine default.                                  |
| Query timeout (ms)   | Aborts a query that runs longer than this. `0` disables.                                         |
| Reload DuckDB engine | Disposes the running instance so CDN / memory changes take effect on the next block.             |

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for build, link-to-vault, and release instructions.
