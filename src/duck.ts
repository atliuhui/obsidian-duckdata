import * as duckdb from '@duckdb/duckdb-wasm';

export interface DuckConfig {
  /** Base URL that hosts `duckdb-{mvp,eh}.wasm` + matching workers. */
  cdnBase: string;
  /** If > 0, applied as `PRAGMA memory_limit='<n>MB'` after connecting. */
  memoryLimitMb: number;
}

export interface DuckHandles {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
  dispose: () => Promise<void>;
}

export type StageReporter = (stage: string) => void;

let singleton: Promise<DuckHandles> | null = null;

/** The bundled DuckDB-WASM version, used to build CDN URLs. */
export const DUCKDB_VERSION: string =
  (duckdb as unknown as { PACKAGE_VERSION?: string }).PACKAGE_VERSION ?? '1.32.0';

/**
 * Lazily initialize a shared DuckDB-WASM instance.
 *
 * Obsidian runs plugins inside an Electron renderer, which always supports the
 * EH (exception handling) bundle. We fetch the worker + wasm from the configured
 * CDN and inline them into blob URLs so the worker runs same-origin with the
 * `app://obsidian.md` page (which sidesteps CSP issues).
 *
 * The worker source is prefixed with a small `Buffer` shim because some
 * dependencies bundled into the DuckDB worker (notably apache-arrow paths)
 * reference Node's `Buffer.from`, which is undefined in a plain web worker.
 */
export function getDuckDB(config: DuckConfig, onStage?: StageReporter): Promise<DuckHandles> {
  if (!singleton) {
    singleton = initDuckDB(config, onStage).catch((err) => {
      singleton = null;
      throw err;
    });
  } else {
    onStage?.('ready');
  }
  return singleton;
}

const WORKER_SHIM = `
// Obsidian's Electron renderer leaks Node globals into Web Workers
// (process, module, require, __dirname, __filename). DuckDB-WASM's
// Emscripten bundle then takes the Node branch and calls into stubbed
// fs/path modules, producing "Cannot read properties of undefined (reading 'from')".
// Force the worker to take the pure-browser code path.
try { delete globalThis.process; } catch (e) {}
try { delete globalThis.module; } catch (e) {}
try { delete globalThis.require; } catch (e) {}
try { delete globalThis.exports; } catch (e) {}
try { delete globalThis.__dirname; } catch (e) {}
try { delete globalThis.__filename; } catch (e) {}
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = {
    from: function (x) {
      if (x instanceof ArrayBuffer) return new Uint8Array(x);
      if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
      if (typeof x === 'string') return new TextEncoder().encode(x);
      return new Uint8Array(x);
    },
    isBuffer: function () { return false; },
    alloc: function (n) { return new Uint8Array(n); },
  };
}
`;

async function fetchWithLabel(url: string, label: string): Promise<Response> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`${label} failed: ${resp.status} ${resp.statusText} (${url})`);
  }
  return resp;
}

async function initDuckDB(config: DuckConfig, onStage?: StageReporter): Promise<DuckHandles> {
  onStage?.('selecting bundle');
  const cdn = config.cdnBase;
  const bundles: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: `${cdn}/duckdb-mvp.wasm`,
      mainWorker: `${cdn}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${cdn}/duckdb-eh.wasm`,
      mainWorker: `${cdn}/duckdb-browser-eh.worker.js`,
    },
  };
  const bundle = await duckdb.selectBundle(bundles);

  onStage?.('downloading worker');
  const workerSrc = await (await fetchWithLabel(bundle.mainWorker!, 'fetch worker')).text();
  const workerUrl = URL.createObjectURL(
    new Blob([WORKER_SHIM, workerSrc], { type: 'text/javascript' }),
  );

  onStage?.('downloading wasm');
  const wasmBytes = await (await fetchWithLabel(bundle.mainModule!, 'fetch wasm')).arrayBuffer();
  const wasmBlobUrl = URL.createObjectURL(new Blob([wasmBytes], { type: 'application/wasm' }));

  onStage?.('starting worker');
  const worker = new Worker(workerUrl);

  let workerErrorListener: ((ev: Event) => void) | null = null;
  const workerErrorDuringInit = new Promise<never>((_, reject) => {
    workerErrorListener = (ev: Event) => {
      const e = ev as ErrorEvent;
      const where = e.filename ? ` at ${e.filename}:${e.lineno}:${e.colno}` : '';
      reject(new Error(`worker error: ${e.message || 'unknown'}${where}`));
    };
    worker.addEventListener('error', workerErrorListener, { once: true });
  });

  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);

  onStage?.('instantiating wasm');
  try {
    await Promise.race([db.instantiate(wasmBlobUrl, undefined), workerErrorDuringInit]);
  } finally {
    URL.revokeObjectURL(wasmBlobUrl);
    if (workerErrorListener) {
      worker.removeEventListener('error', workerErrorListener);
      workerErrorListener = null;
    }
  }

  onStage?.('connecting');
  const conn = await db.connect();

  if (config.memoryLimitMb > 0) {
    onStage?.(`applying memory_limit=${config.memoryLimitMb}MB`);
    try {
      await conn.query(`PRAGMA memory_limit='${config.memoryLimitMb}MB'`);
    } catch (err) {
      console.warn('[duckdata] failed to apply memory_limit:', err);
    }
  }

  let duckVersion = 'unknown';
  try {
    const r = await conn.query('SELECT version() AS v');
    duckVersion = String(r.toArray()[0].toJSON().v);
  } catch (err) {
    console.warn('[duckdata] version query failed:', err);
  }
  onStage?.(`ready (DuckDB ${duckVersion})`);

  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    try { await conn.close(); } catch (err) { console.warn(err); }
    try { await db.terminate(); } catch (err) { console.warn(err); }
    URL.revokeObjectURL(workerUrl);
  };

  return { db, conn, dispose };
}

export async function disposeDuckDB(): Promise<void> {
  if (!singleton) return;
  try {
    const handles = await singleton;
    await handles.dispose();
  } finally {
    singleton = null;
  }
}
