import { App, MarkdownView, TFile, normalizePath, requestUrl } from 'obsidian';
import { inferFormat } from './formats';
import type { ResolvedDataSource } from './types';

/**
 * Resolve a `datasource` reference to a binary payload + format.
 *
 * Accepted forms:
 *   #id                      → anchor `<!-- duckdata:table id=ID -->` above a
 *                              CSV-equivalent markdown pipe table in the current note
 *   path/to/note.md#id       → anchor in another vault note
 *   path/to/file.{csv,tsv,json,ndjson,parquet}
 *                            → file in the vault; any DuckDB-supported format
 *   http(s)://...            → remote file; format inferred from URL extension
 *
 * Note: markdown-embedded sources (inline `data` and anchor tables) are CSV only.
 */
export async function resolveDataSource(
  app: App,
  ref: string,
  ctxSourcePath: string,
): Promise<ResolvedDataSource> {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error('Empty `datasource` reference.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return fetchRemote(trimmed);
  }

  if (trimmed.startsWith('#')) {
    return loadAnchorTable(app, trimmed.slice(1), ctxSourcePath, ctxSourcePath);
  }

  const hashIdx = trimmed.indexOf('#');
  if (hashIdx !== -1) {
    const notePath = trimmed.slice(0, hashIdx);
    const anchorId = trimmed.slice(hashIdx + 1);
    return loadAnchorTable(app, anchorId, notePath, ctxSourcePath);
  }

  return loadVaultFile(app, trimmed);
}

async function fetchRemote(url: string): Promise<ResolvedDataSource> {
  const format = inferFormat(url);
  const resp = await requestUrl({ url, method: 'GET' });
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`Remote fetch failed: ${resp.status} ${url}`);
  }
  return { bytes: new Uint8Array(resp.arrayBuffer), format, origin: url };
}

async function loadVaultFile(app: App, path: string): Promise<ResolvedDataSource> {
  const normalized = normalizePath(path);
  const file = app.vault.getAbstractFileByPath(normalized);
  if (!(file instanceof TFile)) {
    throw new Error(`Vault file not found: ${normalized}`);
  }
  const format = inferFormat(file.path);
  const buf = await app.vault.readBinary(file);
  return { bytes: new Uint8Array(buf), format, origin: normalized };
}

async function loadAnchorTable(
  app: App,
  anchorId: string,
  notePath: string,
  ctxSourcePath: string,
): Promise<ResolvedDataSource> {
  const target = app.metadataCache.getFirstLinkpathDest(notePath, ctxSourcePath)
    ?? app.vault.getAbstractFileByPath(normalizePath(notePath));
  if (!(target instanceof TFile)) {
    throw new Error(`Note not found for anchor lookup: ${notePath}`);
  }
  const md = await app.vault.read(target);
  const csv = extractTableAfterAnchor(md, anchorId);
  if (csv == null) {
    throw new Error(
      `Anchor \`<!-- duckdata:table id=${anchorId} -->\` not found (or no table follows it) in ${target.path}.`,
    );
  }
  return { bytes: encodeUtf8(csv), format: 'csv', origin: `${target.path}#${anchorId}` };
}

/**
 * Locate `<!-- duckdata:table id=ID -->` then read the markdown pipe table
 * immediately below it (skipping blank lines) and convert it to CSV.
 */
function extractTableAfterAnchor(markdown: string, id: string): string | null {
  const anchor = new RegExp(
    `<!--\\s*duckdata:table\\s+id\\s*=\\s*["']?${escapeRegExp(id)}["']?\\s*-->`,
    'i',
  );
  const m = anchor.exec(markdown);
  if (!m) return null;

  const lines = markdown.slice(m.index + m[0].length).split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;

  const tableLines: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    if (!line.includes('|')) break;
    tableLines.push(line);
  }
  if (tableLines.length < 2) return null;

  return mdTableToCsv(tableLines);
}

function mdTableToCsv(tableLines: string[]): string {
  const rows = tableLines
    .map(splitPipeRow)
    .filter((cells) => cells.length > 0)
    .filter((cells) => !cells.every((c) => /^:?-{3,}:?$/.test(c.trim())));

  return rows.map((cells) => cells.map(csvEscape).join(',')).join('\n');
}

function splitPipeRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Resolve the current note's path, falling back to the active MarkdownView. */
export function currentNotePath(app: App, ctxSourcePath: string): string {
  if (ctxSourcePath) return ctxSourcePath;
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  return view?.file?.path ?? '';
}
