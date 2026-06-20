import { use, init, type EChartsType } from 'echarts/core';
import {
  // Cartesian
  BarChart, LineChart, ScatterChart, EffectScatterChart,
  CandlestickChart, BoxplotChart, HeatmapChart, PictorialBarChart, LinesChart,
  // Pie family
  PieChart, FunnelChart, GaugeChart,
  // Tree / hierarchy
  TreeChart, TreemapChart, SunburstChart,
  // Relationship
  GraphChart, SankeyChart,
  // Multi-dimensional
  RadarChart, ParallelChart,
  // Geo / time
  MapChart, ThemeRiverChart,
  // Custom
  CustomChart,
} from 'echarts/charts';
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  DatasetComponent, ToolboxComponent, DataZoomComponent, VisualMapComponent,
  MarkLineComponent, MarkPointComponent, MarkAreaComponent,
  TransformComponent, GeoComponent, PolarComponent, RadarComponent,
  ParallelComponent, SingleAxisComponent, TimelineComponent, CalendarComponent,
  GraphicComponent, BrushComponent, AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { LabelLayout, UniversalTransition } from 'echarts/features';

// Register every built-in ECharts chart kind so users can author any of them
// via raw passthrough. Tree-shaking still drops sub-modules we do not import
// (themes, SVG renderer, locales, etc.). Bundle size: ~1.3 MB.
use([
  // Chart kinds (22 total: all built-in series types)
  BarChart, LineChart, ScatterChart, EffectScatterChart,
  CandlestickChart, BoxplotChart, HeatmapChart, PictorialBarChart, LinesChart,
  PieChart, FunnelChart, GaugeChart,
  TreeChart, TreemapChart, SunburstChart,
  GraphChart, SankeyChart,
  RadarChart, ParallelChart,
  MapChart, ThemeRiverChart,
  CustomChart,
  // Components
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  DatasetComponent, ToolboxComponent, DataZoomComponent, VisualMapComponent,
  MarkLineComponent, MarkPointComponent, MarkAreaComponent,
  TransformComponent, GeoComponent, PolarComponent, RadarComponent,
  ParallelComponent, SingleAxisComponent, TimelineComponent, CalendarComponent,
  GraphicComponent, BrushComponent, AriaComponent,
  // Renderer + features
  CanvasRenderer, LabelLayout, UniversalTransition,
]);

type ChartTheme = 'light' | 'dark';

function currentTheme(): ChartTheme {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

export interface ChartInstance {
  dispose(): void;
}

/**
 * Create a chart inside `dom`, applying `option` and wiring up:
 *   - automatic resize when `dom` size changes
 *   - theme swap when Obsidian's `body.theme-dark` class toggles
 *
 * Chart instances are tracked in `CHART_REGISTRY` so the plugin can dispose
 * them all on unload.
 */
export function createChart(dom: HTMLElement, option: Record<string, unknown>): ChartInstance {
  let theme = currentTheme();
  let lastOption = option;
  let chart: EChartsType = init(dom, theme);
  chart.setOption(lastOption);

  const resizeObs = new ResizeObserver(() => {
    chart.resize();
  });
  resizeObs.observe(dom);

  const themeObs = new MutationObserver(() => {
    const next = currentTheme();
    if (next === theme) return;
    theme = next;
    chart.dispose();
    chart = init(dom, theme);
    chart.setOption(lastOption);
  });
  themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const instance: ChartInstance = {
    dispose() {
      if (!CHART_REGISTRY.delete(instance)) return;
      try { resizeObs.disconnect(); } catch (err) { console.warn(err); }
      try { themeObs.disconnect(); } catch (err) { console.warn(err); }
      try { chart.dispose(); } catch (err) { console.warn(err); }
    },
  };
  CHART_REGISTRY.add(instance);
  return instance;
}

const CHART_REGISTRY = new Set<ChartInstance>();

/** Dispose every live chart. Call on plugin unload. */
export function disposeAllCharts(): void {
  for (const c of Array.from(CHART_REGISTRY)) c.dispose();
}
