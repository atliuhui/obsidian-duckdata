import { Plugin } from 'obsidian';
import { processDuckDataBlock } from './processor';
import { disposeDuckDB } from './duck';
import { disposeAllCharts } from './echarts';
import { DEFAULT_SETTINGS, DuckDataSettings, DuckDataSettingTab } from './settings';

export default class DuckDataPlugin extends Plugin {
  settings: DuckDataSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new DuckDataSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('duckdata', (source, el, ctx) =>
      processDuckDataBlock(this, source, el, ctx),
    );
  }

  onunload(): void {
    // Plugin.onunload is typed `void`, so we fire-and-forget the async DuckDB
    // teardown. Errors are swallowed because the renderer is going away anyway.
    disposeAllCharts();
    void disposeDuckDB();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<DuckDataSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Dispose the running DuckDB instance so the next block reinitializes it. */
  async resetDuck(): Promise<void> {
    await disposeDuckDB();
  }
}
