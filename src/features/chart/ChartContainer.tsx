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
  buildIntradayPricePoints,
  calculateBollingerBands,
  calculateEMA,
  calculateSMA,
  calculateVWAP,
  computeAutoCandlesLod,
  computeAutoIntradayLod,
  computeChartIndicatorsSummary,
  findNearestHoverPoint,
  type IndicatorId,
  type ProjectedHoverPoint,
} from '../../core/indicators/technicalIndicators';
import type { LogicalAnchor } from '../../core/schemas/annotation';
import {
  TIMEFRAME_FOCUS_DAYS,
  computeTimeframeFocusWindow,
  type OHLCVCandle,
  type Timeframe,
} from '../../core/schemas/market';
import { IndicatorToolbar } from './IndicatorToolbar';
import type {
  ChartOverlayHostContext,
  CoordinateProjector,
  ScreenPoint,
} from './types';

const DEFAULT_ACTIVE_INDICATORS: IndicatorId[] = [
  'CANDLES',
  'VOLUME',
  'PRICE_15M',
];

export interface ChartContainerProps {
  ticker: string;
  timeframe: Timeframe;
  candles: OHLCVCandle[];
  intradayCandles?: OHLCVCandle[];
  isLoading?: boolean;
  defaultIndicators?: IndicatorId[];
  /**
   * Optional monotonic counter incremented when user explicitly clicks a timeframe button
   * so clicking the active timeframe re-focuses the viewport back onto that horizon.
   */
  focusRevision?: number;
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
  intradayCandles = [],
  isLoading = false,
  defaultIndicators = DEFAULT_ACTIVE_INDICATORS,
  focusRevision = 0,
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
  const [hoverCursorX, setHoverCursorX] = useState<number | null>(null);

  // Initialize active indicators:
  // - Auto-LOD defaults PRICE_15M to ON for < 3M horizons (< 90 days) and OFF for >= 3M
  // - Auto-LOD defaults CANDLES to OFF for < 1M horizons (< 30 days) and ON for >= 1M
  const [activeIndicators, setActiveIndicators] = useState<IndicatorId[]>(() => {
    const isUnder3M = TIMEFRAME_FOCUS_DAYS[timeframe] < 90;
    const isAtLeast1M = TIMEFRAME_FOCUS_DAYS[timeframe] >= 30;
    let initial = [...defaultIndicators];
    if (isUnder3M) {
      if (!initial.includes('PRICE_15M')) initial.push('PRICE_15M');
    } else {
      initial = initial.filter((id) => id !== 'PRICE_15M');
    }
    if (isAtLeast1M) {
      if (!initial.includes('CANDLES')) initial.push('CANDLES');
    } else {
      initial = initial.filter((id) => id !== 'CANDLES');
    }
    return initial;
  });

  const lastAutoPriceLodStateRef = useRef<boolean>(
    TIMEFRAME_FOCUS_DAYS[timeframe] < 90
  );
  const lastAutoCandlesLodStateRef = useRef<boolean>(
    TIMEFRAME_FOCUS_DAYS[timeframe] >= 30
  );
  const lastTimeframeKeyRef = useRef<string>(
    `${ticker}:${timeframe}:${focusRevision}`
  );

  const sortedCandles = useMemo(
    () => [...candles].sort((a, b) => a.timestamp - b.timestamp),
    [candles]
  );

  const indicatorSummary = useMemo(
    () => computeChartIndicatorsSummary(sortedCandles),
    [sortedCandles]
  );

  const intradayPricePoints = useMemo(
    () => buildIntradayPricePoints(sortedCandles, intradayCandles),
    [sortedCandles, intradayCandles]
  );

  // Smart Auto-Sync: When the user switches ticker/timeframe or clicks focusRevision,
  // sync PRICE_15M (< 3M -> ON, >= 3M -> OFF) and CANDLES (>= 1M -> ON, < 1M -> OFF)
  const timeframeKey = `${ticker}:${timeframe}:${focusRevision}`;
  useEffect(() => {
    if (timeframeKey !== lastTimeframeKeyRef.current) {
      lastTimeframeKeyRef.current = timeframeKey;
      const shouldShowPrice = TIMEFRAME_FOCUS_DAYS[timeframe] < 90;
      const shouldShowCandles = TIMEFRAME_FOCUS_DAYS[timeframe] >= 30;
      lastAutoPriceLodStateRef.current = shouldShowPrice;
      lastAutoCandlesLodStateRef.current = shouldShowCandles;
      setActiveIndicators((prev) => {
        let updated = [...prev];
        if (shouldShowPrice) {
          if (!updated.includes('PRICE_15M')) updated.push('PRICE_15M');
        } else {
          updated = updated.filter((id) => id !== 'PRICE_15M');
        }
        if (shouldShowCandles) {
          if (!updated.includes('CANDLES')) updated.push('CANDLES');
        } else {
          updated = updated.filter((id) => id !== 'CANDLES');
        }
        return updated;
      });
    }
  }, [timeframeKey, timeframe]);

  // Smart Auto-Sync: When the user zooms/pans across the LOD boundaries,
  // automatically update PRICE_15M (< 3M) and CANDLES (>= 1M)
  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart || sortedCandles.length < 2) {
      return;
    }
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (!logicalRange) {
      return;
    }
    const shouldShowPriceByLod = computeAutoIntradayLod(
      sortedCandles,
      logicalRange,
      timeframe
    );
    const shouldShowCandlesByLod = computeAutoCandlesLod(
      sortedCandles,
      logicalRange,
      timeframe
    );

    const priceChanged =
      lastAutoPriceLodStateRef.current !== null &&
      lastAutoPriceLodStateRef.current !== shouldShowPriceByLod;
    const candlesChanged =
      lastAutoCandlesLodStateRef.current !== null &&
      lastAutoCandlesLodStateRef.current !== shouldShowCandlesByLod;

    if (priceChanged || candlesChanged) {
      if (priceChanged) {
        lastAutoPriceLodStateRef.current = shouldShowPriceByLod;
      }
      if (candlesChanged) {
        lastAutoCandlesLodStateRef.current = shouldShowCandlesByLod;
      }
      setActiveIndicators((prev) => {
        let updated = [...prev];
        if (priceChanged) {
          updated = shouldShowPriceByLod
            ? updated.includes('PRICE_15M')
              ? updated
              : [...updated, 'PRICE_15M']
            : updated.filter((id) => id !== 'PRICE_15M');
        }
        if (candlesChanged) {
          updated = shouldShowCandlesByLod
            ? updated.includes('CANDLES')
              ? updated
              : [...updated, 'CANDLES']
            : updated.filter((id) => id !== 'CANDLES');
        }
        return updated;
      });
    }
  }, [viewportRevision, sortedCandles, timeframe]);

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

  // 1. Data loading & viewport focus:
  // Decoupled from activeIndicators so toggling indicators NEVER re-uploads candle data,
  // never clears series with setData([]), and never resets or corrupts the TimeScale logical range.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const chart = chartApiRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const sma20Series = sma20SeriesRef.current;
    const ema50Series = ema50SeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    const bbUpperSeries = bbUpperSeriesRef.current;
    const bbLowerSeries = bbLowerSeriesRef.current;

    if (
      !candleSeries ||
      !chart ||
      !volumeSeries ||
      !sma20Series ||
      !ema50Series ||
      !vwapSeries ||
      !bbUpperSeries ||
      !bbLowerSeries
    ) {
      return;
    }

    const sorted = sortedCandles;

    // Upload full data to all series synchronously
    candleSeries.setData(
      sorted.map((c) => ({
        time: c.timestamp as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeries.setData(
      sorted.map((c) => ({
        time: c.timestamp as UTCTimestamp,
        value: c.volume,
        color:
          c.close >= c.open
            ? 'rgba(16, 185, 129, 0.28)'
            : 'rgba(244, 63, 94, 0.28)',
      }))
    );

    sma20Series.setData(
      calculateSMA(sorted, 20).map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    ema50Series.setData(
      calculateEMA(sorted, 50).map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    vwapSeries.setData(
      calculateVWAP(sorted).map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    const bbPoints = calculateBollingerBands(sorted, 20, 2);
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

    // Focus time range and ensure right Y-axis autoScale
    const latestClose = sorted[sorted.length - 1]?.close ?? 0;
    const currentSeriesKey = `${ticker}:${timeframe}:${focusRevision}:${sorted.length}:${latestClose}`;
    if (sorted.length > 0 && currentSeriesKey !== lastFittedSeriesKeyRef.current) {
      const focusWindow = computeTimeframeFocusWindow(sorted, timeframe);
      const timeScale = chart.timeScale();

      // Reset price scale auto-scaling first in case the user previously dragged/locked the Y-axis
      chart.applyOptions({
        rightPriceScale: {
          autoScale: true,
        },
      });
      candleSeries.priceScale?.().applyOptions?.({ autoScale: true });
      chart.priceScale?.('right')?.applyOptions?.({ autoScale: true });

      if (focusWindow) {
        const fromIndex = Math.max(
          0,
          sorted.findIndex((c) => c.timestamp >= focusWindow.from)
        );
        const toIndex = Math.max(fromIndex, sorted.length - 1);
        if (typeof timeScale.setVisibleLogicalRange === 'function') {
          timeScale.setVisibleLogicalRange({
            from: fromIndex,
            to: toIndex,
          });
        } else if (typeof timeScale.setVisibleRange === 'function') {
          timeScale.setVisibleRange({
            from: focusWindow.from as UTCTimestamp,
            to: focusWindow.to as UTCTimestamp,
          });
        }
      } else {
        timeScale.fitContent();
      }

      // Ensure Y-axis autoScale remains active for the newly focused visible range
      chart.applyOptions({
        rightPriceScale: {
          autoScale: true,
        },
      });
      candleSeries.priceScale?.().applyOptions?.({ autoScale: true });
      chart.priceScale?.('right')?.applyOptions?.({ autoScale: true });

      lastFittedSeriesKeyRef.current = currentSeriesKey;
    }
    setViewportRevision((rev) => rev + 1);
  }, [ticker, timeframe, sortedCandles, focusRevision]);

  // 2. Non-destructive indicator visibility toggling:
  // Purely updates series visibility and styles without clearing data or re-fitting the chart
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const sma20Series = sma20SeriesRef.current;
    const ema50Series = ema50SeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    const bbUpperSeries = bbUpperSeriesRef.current;
    const bbLowerSeries = bbLowerSeriesRef.current;

    if (
      !candleSeries ||
      !volumeSeries ||
      !sma20Series ||
      !ema50Series ||
      !vwapSeries ||
      !bbUpperSeries ||
      !bbLowerSeries
    ) {
      return;
    }

    const showCandles = activeIndicators.includes('CANDLES');
    candleSeries.applyOptions({
      visible: true,
      upColor: showCandles ? '#10b981' : 'transparent',
      downColor: showCandles ? '#f43f5e' : 'transparent',
      borderUpColor: showCandles ? '#10b981' : 'transparent',
      borderDownColor: showCandles ? '#f43f5e' : 'transparent',
      wickUpColor: showCandles ? '#10b981' : 'transparent',
      wickDownColor: showCandles ? '#f43f5e' : 'transparent',
    });

    const showVolume = activeIndicators.includes('VOLUME');
    volumeSeries.applyOptions?.({ visible: showVolume });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    const showSma20 = activeIndicators.includes('SMA_20');
    sma20Series.applyOptions?.({ visible: showSma20 });

    const showEma50 = activeIndicators.includes('EMA_50');
    ema50Series.applyOptions?.({ visible: showEma50 });

    const showVwap = activeIndicators.includes('VWAP');
    vwapSeries.applyOptions?.({ visible: showVwap });

    const showBb20 = activeIndicators.includes('BB_20');
    bbUpperSeries.applyOptions?.({ visible: showBb20 });
    bbLowerSeries.applyOptions?.({ visible: showBb20 });
  }, [activeIndicators]);

  // Unified projection memo: computes 15-minute price line SVG coordinates
  // and hover candidate points (Priority 1: 15m line points when visible; Priority 2: daily close prices when hidden)
  const { pricePolylinePoints, hoverCandidates } = useMemo(() => {
    if (
      !chartApiRef.current ||
      !candleSeriesRef.current ||
      dimensions.width === 0 ||
      dimensions.height === 0 ||
      sortedCandles.length === 0
    ) {
      return { pricePolylinePoints: '', hoverCandidates: [] as ProjectedHoverPoint[] };
    }

    const chart = chartApiRef.current;
    const series = candleSeriesRef.current;
    const timeScale = chart.timeScale();

    const dailyXByTimestamp = new Map<number, number>();
    for (const c of sortedCandles) {
      const coord = timeScale.timeToCoordinate(c.timestamp as UTCTimestamp);
      if (coord !== null) {
        dailyXByTimestamp.set(c.timestamp, Number(coord));
      }
    }

    if (dailyXByTimestamp.size === 0) {
      return { pricePolylinePoints: '', hoverCandidates: [] as ProjectedHoverPoint[] };
    }

    const barSpacingByTimestamp = new Map<number, number>();
    for (let i = 0; i < sortedCandles.length; i++) {
      const current = sortedCandles[i]!;
      const currentX = dailyXByTimestamp.get(current.timestamp);
      if (currentX === undefined) continue;

      let spacing = 12;
      if (i + 1 < sortedCandles.length) {
        const next = sortedCandles[i + 1]!;
        const nextX = dailyXByTimestamp.get(next.timestamp);
        if (nextX !== undefined) {
          spacing = Math.abs(nextX - currentX);
        }
      } else if (i - 1 >= 0) {
        const prev = sortedCandles[i - 1]!;
        const prevX = dailyXByTimestamp.get(prev.timestamp);
        if (prevX !== undefined) {
          spacing = Math.abs(currentX - prevX);
        }
      }
      barSpacingByTimestamp.set(
        current.timestamp,
        Math.max(2, Math.min(spacing, 400))
      );
    }

    const showPrice15m = activeIndicators.includes('PRICE_15M');
    const svgCoords: string[] = [];
    const candidates: ProjectedHoverPoint[] = [];

    if (showPrice15m && intradayPricePoints.length >= 2) {
      for (const pt of intradayPricePoints) {
        const baseX = dailyXByTimestamp.get(pt.dailyTimestamp);
        if (baseX === undefined) continue;

        const spacing = barSpacingByTimestamp.get(pt.dailyTimestamp) ?? 12;
        const x = baseX + pt.intraDayOffset * spacing;
        const yCoord = series.priceToCoordinate(pt.price);
        if (yCoord === null) continue;
        const y = Number(yCoord);

        if (x >= -60 && x <= dimensions.width + 60) {
          svgCoords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          if (x >= 0 && x <= dimensions.width) {
            candidates.push({
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              price: pt.price,
              timestamp: pt.timestamp,
              source: 'price_15m',
            });
          }
        }
      }
    } else if (activeIndicators.includes('CANDLES')) {
      // When 15m price line is hidden but CANDLES is active, candidate hover points are daily candle close prices
      for (const c of sortedCandles) {
        const baseX = dailyXByTimestamp.get(c.timestamp);
        if (baseX === undefined) continue;

        const yCoord = series.priceToCoordinate(c.close);
        if (yCoord === null) continue;
        const y = Number(yCoord);

        if (baseX >= 0 && baseX <= dimensions.width) {
          candidates.push({
            x: Math.round(baseX * 10) / 10,
            y: Math.round(y * 10) / 10,
            price: c.close,
            timestamp: c.timestamp,
            source: 'daily_bar',
          });
        }
      }
    }

    return {
      pricePolylinePoints: svgCoords.join(' '),
      hoverCandidates: candidates,
    };
  }, [
    activeIndicators,
    intradayPricePoints,
    sortedCandles,
    dimensions,
    viewportRevision,
  ]);

  const activeHoverPoint = useMemo(
    () =>
      hoverCursorX !== null
        ? findNearestHoverPoint(hoverCursorX, hoverCandidates)
        : null,
    [hoverCursorX, hoverCandidates]
  );

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
    <div
      className="relative h-full w-full flex-1 bg-slate-950 select-none overflow-hidden"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoverCursorX(e.clientX - rect.left);
      }}
      onMouseLeave={() => setHoverCursorX(null)}
    >
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
          {candles.length} bars
        </span>
      </div>

      {/* Technical Indicators Pill Toolbar & Live Readout */}
      <IndicatorToolbar
        activeIndicators={activeIndicators}
        onToggleIndicator={handleToggleIndicator}
        summary={indicatorSummary}
      />

      {/* 15-Minute Intraday Actual Price Line Layer */}
      {activeIndicators.includes('PRICE_15M') && pricePolylinePoints ? (
        <svg
          data-testid="intraday-price-line-layer"
          className="pointer-events-none absolute inset-0 z-5 h-full w-full overflow-hidden"
        >
          <polyline
            data-testid="intraday-price-polyline"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pricePolylinePoints}
          />
        </svg>
      ) : null}

      {/* Priority Hover Tracking Dot & Halo Layer */}
      {activeHoverPoint && (
        <svg
          data-testid="chart-hover-tracker"
          className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-hidden"
        >
          <circle
            cx={activeHoverPoint.x}
            cy={activeHoverPoint.y}
            r={8}
            fill="rgba(37, 99, 235, 0.25)"
          />
          <circle
            data-testid="chart-hover-dot"
            cx={activeHoverPoint.x}
            cy={activeHoverPoint.y}
            r={4.5}
            fill="#1d4ed8"
            stroke="#e0f2fe"
            strokeWidth={1.75}
          />
        </svg>
      )}

      {/* Floating Price Callout Badge */}
      {activeHoverPoint && (
        <div
          data-testid="chart-hover-price-label"
          className="pointer-events-none absolute z-25 flex items-center gap-1 rounded border border-blue-500/60 bg-blue-950/90 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-100 shadow-lg backdrop-blur-sm"
          style={{
            left: `${
              activeHoverPoint.x > (dimensions.width > 0 ? dimensions.width - 110 : 700)
                ? activeHoverPoint.x - 76
                : activeHoverPoint.x + 10
            }px`,
            top: `${
              activeHoverPoint.y < 36
                ? activeHoverPoint.y + 14
                : activeHoverPoint.y - 28
            }px`,
          }}
        >
          <span>${activeHoverPoint.price.toFixed(2)}</span>
        </div>
      )}

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
