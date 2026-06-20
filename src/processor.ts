import { MarkdownPostProcessorContext } from 'obsidian';
import { parseDuckDataBlock } from './parser';
import { currentNotePath, encodeUtf8, resolveDataSource } from './datasource';
import { DUCKDB_VERSION, getDuckDB } from './duck';
import { readerSql, virtualFileName, wrapWithDataCte } from './formats';
import { renderTable } from './renderers/table';
import { renderChart } from './renderers/chart';
import { resolveCdnBase } from './settings';
import type DuckDataPlugin from './main';
import type { DuckDataSpec, ResolvedDataSource } from './types';

let blockCounter = 0;

/**
 * Markdown post-processor for ```duckdata fenced blocks.
 * Lifecycle: parse → resolve datasource → register virtual file → run
 * `WITH data AS (...) <user sql>` → render.
 *
 * Each block uses a unique virtual file name and exposes its dataset as a
 * query-scoped CTE named `data`, so concurrent blocks never share state.
 */
export async function processDuckDataBlock(
  plugin: DuckDataPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  const app = plugin.app;
  const container = el.createDiv({ cls: 'duckdata-container' });
  const status = container.createDiv({ cls: 'duckdata-status' });
  const setStatus = (msg: string) => { status.setText(`duckdata: ${msg}`); };
  setStatus('parsing spec');

  let spec: DuckDataSpec;
  try {
    spec = parseDuckDataBlock(source);
  } catch (err) {
    showError(container, status, 'parse', err);
    return;
  }

  let stage = 'init';
  try {
    stage = 'resolving datasource';
    setStatus(stage);
    const notePath = currentNotePath(app, ctx.sourcePath);
    const dataset: ResolvedDataSource = spec.data !== undefined
      ? { bytes: encodeUtf8(spec.data), format: 'csv', origin: 'inline' }
      : await resolveDataSource(app, spec.datasource!, notePath);
    setStatus(`resolved ${dataset.format} (${dataset.bytes.byteLength} bytes) from ${dataset.origin}`);

    stage = 'initializing duckdb';
    const duckConfig = {
      cdnBase: resolveCdnBase(plugin.settings, DUCKDB_VERSION),
      memoryLimitMb: plugin.settings.memoryLimitMb,
    };
    const { db, conn } = await getDuckDB(duckConfig, (s) => setStatus(`duckdb: ${s}`));

    stage = 'registering data';
    setStatus(stage);
    const blockId = `b${Date.now().toString(36)}_${(++blockCounter).toString(36)}`;
    const fileName = virtualFileName(blockId, dataset.format);
    await db.registerFileBuffer(fileName, dataset.bytes);

    try {
      stage = 'executing sql';
      setStatus(`${stage} (read_${dataset.format} → CTE \`data\`)`);
      const finalSql = wrapWithDataCte(spec.sql, readerSql(fileName, dataset.format));
      const result = await runWithTimeout(
        () => conn.query(finalSql),
        plugin.settings.queryTimeoutMs,
        () => { void conn.cancelSent().catch(() => undefined); },
      );

      stage = 'rendering';
      setStatus(`${stage} ${result.numRows} rows`);
      if (spec.type === 'table') {
        renderTable(container, result);
      } else {
        if (!spec.chart) {
          throw new Error('`chart` is required for `type: chart`.');
        }
        renderChart(container, result, spec.chart);
      }
      status.remove();
    } finally {
      try { await db.dropFile(fileName); } catch (err) { console.warn(err); }
    }
  } catch (err) {
    showError(container, status, stage, err);
  }
}

function showError(container: HTMLElement, status: HTMLElement, stage: string, err: unknown): void {
  status.remove();
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? `\n\n${err.stack}` : '';
  container.createDiv({
    cls: 'duckdata-error',
    text: `duckdata error during "${stage}":\n${msg}${stack}`,
  });
  console.error(`[duckdata] failed at stage "${stage}":`, err);
}

/**
 * Race the work against a timer. On timeout, invoke `onTimeout` (best-effort
 * cancellation) and reject with a `QueryTimeoutError`.
 */
async function runWithTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  if (timeoutMs <= 0) return work();
  let timer: number | undefined;
  try {
    return await Promise.race<T>([
      work(),
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => {
          onTimeout();
          reject(new Error(`Query timed out after ${timeoutMs} ms (configure under Settings → DuckData).`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
