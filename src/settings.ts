import { App, PluginSettingTab, Setting } from 'obsidian';
import type DuckDataPlugin from './main';

export type CdnMirror = 'jsdelivr' | 'unpkg' | 'custom';

export interface DuckDataSettings {
  /** Which CDN to download the DuckDB-WASM worker + module from. */
  cdnMirror: CdnMirror;
  /** Used when `cdnMirror === 'custom'`. May contain `{version}` placeholder. */
  customCdnUrl: string;
  /** Forwarded to DuckDB via `PRAGMA memory_limit`. 0 keeps the engine default. */
  memoryLimitMb: number;
  /** Abort a query after this many milliseconds. 0 disables the timeout. */
  queryTimeoutMs: number;
}

export const DEFAULT_SETTINGS: DuckDataSettings = {
  cdnMirror: 'jsdelivr',
  customCdnUrl: '',
  memoryLimitMb: 0,
  queryTimeoutMs: 0,
};

/** Build the base URL containing `duckdb-{mvp,eh}.wasm` + matching workers. */
export function resolveCdnBase(settings: DuckDataSettings, version: string): string {
  if (settings.cdnMirror === 'custom') {
    const base = settings.customCdnUrl.trim().replace(/\/+$/, '');
    if (!base) {
      throw new Error(
        'DuckData: custom CDN URL is empty. Set it under Settings → DuckData.',
      );
    }
    return base.replace(/\{version\}/gi, version);
  }
  const host = settings.cdnMirror === 'unpkg'
    ? 'https://unpkg.com'
    : 'https://cdn.jsdelivr.net/npm';
  return `${host}/@duckdb/duckdb-wasm@${version}/dist`;
}

function parseNonNegativeInt(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export class DuckDataSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: DuckDataPlugin) {
    super(app, plugin);
  }

  display(): void {
    // `PluginSettingTab.display()` is marked @deprecated since Obsidian 1.13.0
    // in favour of `getSettingDefinitions()`. We still implement it as the
    // documented fallback for `minAppVersion` 1.5.0, but the body delegates to
    // a private renderer so internal re-renders avoid calling the deprecated
    // method recursively.
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('CDN mirror')
      .setDesc('Where the DuckDB-WASM worker and module are downloaded from.')
      .addDropdown((dd) =>
        dd
          .addOption('jsdelivr', 'jsDelivr (default)')
          .addOption('unpkg', 'unpkg')
          .addOption('custom', 'Custom URL')
          .setValue(this.plugin.settings.cdnMirror)
          .onChange(async (val) => {
            this.plugin.settings.cdnMirror = val as CdnMirror;
            await this.plugin.saveSettings();
            this.renderSettings();
          }),
      );

    if (this.plugin.settings.cdnMirror === 'custom') {
      new Setting(containerEl)
        .setName('Custom CDN URL')
        .setDesc(
          'Base URL that contains duckdb-{mvp,eh}.wasm and duckdb-browser-{mvp,eh}.worker.js. ' +
          'Use {version} as a placeholder, e.g. https://my.cdn/duckdb-wasm@{version}/dist',
        )
        .addText((t) =>
          t
            .setPlaceholder('https://my.cdn/duckdb-wasm@{version}/dist')
            .setValue(this.plugin.settings.customCdnUrl)
            .onChange(async (val) => {
              this.plugin.settings.customCdnUrl = val;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName('DuckDB memory limit (MB)')
      .setDesc('Applied via PRAGMA memory_limit on each new connection. 0 keeps the DuckDB default.')
      .addText((t) =>
        t
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.memoryLimitMb))
          .onChange(async (val) => {
            this.plugin.settings.memoryLimitMb = parseNonNegativeInt(val);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Query timeout (ms)')
      .setDesc('Abort a query if it runs longer than this. 0 disables the timeout.')
      .addText((t) =>
        t
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.queryTimeoutMs))
          .onChange(async (val) => {
            this.plugin.settings.queryTimeoutMs = parseNonNegativeInt(val);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Reload DuckDB engine')
      .setDesc(
        'Apply CDN / memory changes by disposing the running DuckDB instance. ' +
        'The next code block reinitializes the engine.',
      )
      .addButton((b) =>
        b.setButtonText('Reload now').onClick(async () => {
          await this.plugin.resetDuck();
        }),
      );
  }
}
