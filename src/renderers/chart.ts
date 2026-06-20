import type { Table } from 'apache-arrow';
import { createChart } from '../echarts';
import { buildOption, type ChartRow } from '../chart-dsl';

const DEFAULT_HEIGHT_PX = 300;

/**
 * Render an Apache Arrow Table as an ECharts chart.
 *
 * Chart instances are registered globally so plugin unload disposes their
 * resize and theme observers even if Obsidian removes the note view first.
 */
export function renderChart(
  parent: HTMLElement,
  table: Table,
  chartSpec: Record<string, unknown>,
): void {
  const rows = table.toArray() as ChartRow[];

  const heightRaw = chartSpec.height;
  const height = typeof heightRaw === 'number' && heightRaw > 0
    ? `${Math.floor(heightRaw)}px`
    : `${DEFAULT_HEIGHT_PX}px`;

  const host = parent.createDiv({ cls: 'duckdata-chart' });
  // Width is fixed via the .duckdata-chart class; height varies per block so
  // we expose it via a CSS custom property to avoid inline style assignments.
  host.setCssProps({ '--duckdata-chart-height': height });

  const option = buildOption(chartSpec, rows);
  createChart(host, option);
}
