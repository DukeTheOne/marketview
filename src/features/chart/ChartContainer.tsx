import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateSMA,
  calculateVWAP,
  computeChartIndicatorsSummary,
  type IndicatorId,
} from '../../core/indicators/technicalIndicators';
import type { LogicalAnchor } from '../../core/schemas/annotation';
import type { OHLCVCandle, Timeframe } from '../../core/schemas/market';
import { IndicatorToolbar } from './IndicatorToolbar';
import type {
  ChartOverlayHostContext,
  CoordinateProjector,
  ScreenPoint,
} from './types';

const DEFAULT_ACTIVE_INDICATORS: IndicatorId[] = ['SMA_20', 'VOLUME'];

export interface ChartContainerProps {
  ticker: string;
  timeframe: Timeframe;
  candles: OHLCVCandle[];
  isLoading?: boolean;
  defaultIndicators?: IndicatorId[];
  /**
   * Open-Closed extension slot for Milestone 2+ OverlayCanvas.
   * ChartContainer itself contains zero tool-specific state or branching.
   */
  renderOverlayLayer?: (ctx: ChartOverlayHostContext) => ReactNode;
}

export function ChartContainer({
  ticker,
  timeframe,
  candles,
  isLoading = false,
  defaultIndicators = DEFAULT_ACTIVE_INDICATORS,
  renderOverlayLayer,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lastFittedSeriesKeyRef = useRef<string>('');

  const [viewportRevision, setViewportRevision] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [activeIndicators, setActiveIndicators] =
    useState<IndicatorId[]>(defaultIndicators);

  const indicatorSummary = useMemo(
    () => computeChartIndicatorsSummary(candles),
    [candles]
  );

  const handleToggleIndicator = (id: IndicatorId) => {
    setActiveIndicators((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#0f172a' },
        horzLines: { color: '#0f172a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#334155',
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#334155',
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth || 800,
      height: container.clientHeight || 520,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    const sma20Series = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const vwapSeries = chart.addSeries(LineSeries, {
      color: '#c084fc',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: '#818cf8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: '#818cf8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sma20SeriesRef.current = sma20Series;
    ema50SeriesRef.current = ema50Series;
    vwapSeriesRef.current = vwapSeries;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbLowerSeriesRef.current = bbLowerSeries;
    setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const bumpRevision = () => {
      setViewportRevision((rev) => rev + 1);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(bumpRevision);
    chart.timeScale().subscribeSizeChange(bumpRevision);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
        setDimensions({ width, height });
        bumpRevision();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      sma20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      vwapSeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
      lastFittedSeriesKeyRef.current = '';
    };
  }, []);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const chart = chartApiRef.current;

    if (!candleSeries || !chart) {
      return;
    }

    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    candleSeries.setData(
      sorted.map((c) => ({
        time: c.timestamp as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const currentSeriesKey = `${ticker}:${timeframe}`;
    if (currentSeriesKey !== lastFittedSeriesKeyRef.current) {
      chart.timeScale().fitContent();
      lastFittedSeriesKeyRef.current = currentSeriesKey;
    }
    setViewportRevision((rev) => rev + 1);
  }, [ticker, timeframe, candles]);

  useEffect(() => {
    const volumeSeries = volumeSeriesRef.current;
    const sma20Series = sma20SeriesRef.current;
    const ema50Series = ema50SeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    const bbUpperSeries = bbUpperSeriesRef.current;
    const bbLowerSeries = bbLowerSeriesRef.current;

    if (
      !volumeSeries ||
      !sma20Series ||
      !ema50Series ||
      !vwapSeries ||
      !bbUpperSeries ||
      !bbLowerSeries
    ) {
      return;
    }

    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    const showVolume = activeIndicators.includes('VOLUME');
    volumeSeries.applyOptions?.({ visible: showVolume });
    volumeSeries.setData(
      showVolume
        ? sorted.map((c) => ({
            time: c.timestamp as UTCTimestamp,
            value: c.volume,
            color:
              c.close >= c.open
                ? 'rgba(16, 185, 129, 0.28)'
                : 'rgba(244, 63, 94, 0.28)',
          }))
        : []
    );

    const showSma20 = activeIndicators.includes('SMA_20');
    sma20Series.applyOptions?.({ visible: showSma20 });
    sma20Series.setData(
      showSma20
        ? calculateSMA(sorted, 20).map((p) => ({
            time: p.timestamp as UTCTimestamp,
            value: p.value,
          }))
        : []
    );

    const showEma50 = activeIndicators.includes('EMA_50');
    ema50Series.applyOptions?.({ visible: showEma50 });
    ema50Series.setData(
      showEma50
        ? calculateEMA(sorted, 50).map((p) => ({
            time: p.timestamp as UTCTimestamp,
            value: p.value,
          }))
        : []
    );

    const showVwap = activeIndicators.includes('VWAP');
    vwapSeries.applyOptions?.({ visible: showVwap });
    vwapSeries.setData(
      showVwap
        ? calculateVWAP(sorted).map((p) => ({
            time: p.timestamp as UTCTimestamp,
            value: p.value,
          }))
        : []
    );

    const showBb20 = activeIndicators.includes('BB_20');
    const bbPoints = showBb20 ? calculateBollingerBands(sorted, 20, 2) : [];
    bbUpperSeries.applyOptions?.({ visible: showBb20 });
    bbLowerSeries.applyOptions?.({ visible: showBb20 });
    bbUpperSeries.setData(
      bbPoints.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.upper,
      }))
    );
    bbLowerSeries.setData(
      bbPoints.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.lower,
      }))
    );
  }, [candles, activeIndicators]);

  const projector: CoordinateProjector = {
    logicalToScreen(anchor: LogicalAnchor): ScreenPoint | null {
      const chart = chartApiRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) {
        return null;
      }
      const x = chart
        .timeScale()
        .timeToCoordinate(anchor.timestamp as UTCTimestamp);
      const y = series.priceToCoordinate(anchor.price);
      if (x === null || y === null) {
        return null;
      }
      return { x: Number(x), y: Number(y) };
    },

    screenToLogical(point: ScreenPoint): LogicalAnchor | null {
      const chart = chartApiRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) {
        return null;
      }
      const rawTime = chart.timeScale().coordinateToTime(point.x);
      const rawPrice = series.coordinateToPrice(point.y);
      if (rawTime === null || rawPrice === null || typeof rawTime !== 'number') {
        return null;
      }
      const roundedPrice = Math.round(Number(rawPrice) * 100) / 100;
      if (roundedPrice <= 0) {
        return null;
      }
      return {
        timestamp: Math.floor(rawTime),
        price: roundedPrice,
      };
    },

    priceToCoordinate(price: number): number | null {
      const series = candleSeriesRef.current;
      if (!series) return null;
      const y = series.priceToCoordinate(price);
      return y !== null ? Number(y) : null;
    },
  };

  return (
    <div className="relative h-full w-full flex-1 bg-slate-950 select-none overflow-hidden">
      {/* Lightweight Charts Mount Node */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Watermark badge */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/75 px-3 py-1.5 backdrop-blur-sm">
        <span className="font-mono text-sm font-bold tracking-wider text-slate-100">
          {ticker}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-emerald-400">
          {timeframe}
        </span>
        <span className="text-xs text-slate-400">
          {candles.length} bars · Logical (t, p) Engine
        </span>
      </div>

      {/* Technical Indicators Pill Toolbar & Live Readout */}
      <IndicatorToolbar
        activeIndicators={activeIndicators}
        onToggleIndicator={handleToggleIndicator}
        summary={indicatorSummary}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg">
            Syncing {ticker} ({timeframe}) OHLCV series...
          </div>
        </div>
      )}

      {/* Open-Closed Overlay Plugin Slot */}
      {renderOverlayLayer
        ? renderOverlayLayer({
            ticker,
            projector,
            viewportRevision,
            width: dimensions.width,
            height: dimensions.height,
          })
        : null}
    </div>
  );
}
