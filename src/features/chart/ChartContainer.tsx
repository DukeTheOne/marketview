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
  computeAllChartIndicators,
  findNearestHoverPoint,
  findSurroundingCandles,
  normalizeExclusiveChartStyle,
  toggleExclusiveChartStyle,
  type IndicatorId,
  type ProjectedHoverPoint,
} from '../../core/indicators/technicalIndicators';
import type { LogicalAnchor } from '../../core/schemas/annotation';
import {
  computeCarryOverLogicalRange,
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
  const [activeHoverPoint, setActiveHoverPoint] = useState<ProjectedHoverPoint | null>(null);
  const activeHoverPointRef = useRef<ProjectedHoverPoint | null>(null);
  const hoverCandidatesRef = useRef<ProjectedHoverPoint[]>([]);

  // Initialize active indicators with strictly exclusive primary chart style (CANDLES vs PRICE_15M),
  // defaulting to CANDLES while preserving user preference overrides.
  const [activeIndicators, setActiveIndicators] = useState<IndicatorId[]>(() =>
    normalizeExclusiveChartStyle(defaultIndicators)
  );

  // Milestone 16: Tracking actual viewing scope and free 2D chart drag state
  const viewingLogicalRangeRef = useRef<{ from: number; to: number; barCount: number } | null>(null);
  const sortedCandlesLengthRef = useRef<number>(0);
  const lastAppliedTickerRef = useRef<string>('');
  const lastAppliedFocusRevisionRef = useRef<number>(-1);
  const isApplyingProgrammaticRangeRef = useRef<boolean>(false);
  const isDraggingChartRef = useRef<boolean>(false);
  const [isDraggingChart, setIsDraggingChart] = useState<boolean>(false);

  const sortedCandles = useMemo(
    () => [...candles].sort((a, b) => a.timestamp - b.timestamp),
    [candles]
  );

  const computedIndicators = useMemo(
    () => computeAllChartIndicators(sortedCandles),
    [sortedCandles]
  );

  const intradayPricePoints = useMemo(
    () => buildIntradayPricePoints(sortedCandles, intradayCandles),
    [sortedCandles, intradayCandles]
  );

  const handleToggleIndicator = (id: IndicatorId) => {
    setActiveIndicators((prev) => {
      if (id === 'CANDLES' || id === 'PRICE_15M') {
        return toggleExclusiveChartStyle(prev);
      }
      return prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
    });
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
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
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
      if (!isApplyingProgrammaticRangeRef.current && sortedCandlesLengthRef.current > 0) {
        const range = chart.timeScale().getVisibleLogicalRange?.();
        if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
          viewingLogicalRangeRef.current = {
            from: range.from,
            to: range.to,
            barCount: sortedCandlesLengthRef.current,
          };
        }
      }
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
    const priorViewingScope = viewingLogicalRangeRef.current;
    sortedCandlesLengthRef.current = sorted.length;

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
      computedIndicators.sma20.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    ema50Series.setData(
      computedIndicators.ema50.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    vwapSeries.setData(
      computedIndicators.vwap.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.value,
      }))
    );

    bbUpperSeries.setData(
      computedIndicators.bb20.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.upper,
      }))
    );
    bbLowerSeries.setData(
      computedIndicators.bb20.map((p) => ({
        time: p.timestamp as UTCTimestamp,
        value: p.lower,
      }))
    );

    // Viewport Range Management:
    // Branch A: Initial Launch or Explicit Time Scope Button Click
    // Branch B: Stock Switch (preserves actual viewing scope)
    // Branch C: Same-stock background candle refresh (retains current viewport)
    const isInitialOrFocusRevision =
      lastAppliedFocusRevisionRef.current === -1 ||
      focusRevision !== lastAppliedFocusRevisionRef.current;
    const isTickerSwitch = !isInitialOrFocusRevision && ticker !== lastAppliedTickerRef.current;

    if (sorted.length > 0) {
      const timeScale = chart.timeScale();

      if (isInitialOrFocusRevision) {
        // Branch A: Initial Launch or Explicit Scope Click
        const focusWindow = computeTimeframeFocusWindow(sorted, timeframe);

        // Reset price scale auto-scaling first
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
          isApplyingProgrammaticRangeRef.current = true;
          try {
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
          } finally {
            queueMicrotask(() => {
              isApplyingProgrammaticRangeRef.current = false;
            });
          }
          viewingLogicalRangeRef.current = {
            from: fromIndex,
            to: toIndex,
            barCount: sorted.length,
          };
        } else {
          isApplyingProgrammaticRangeRef.current = true;
          try {
            timeScale.fitContent();
          } finally {
            queueMicrotask(() => {
              isApplyingProgrammaticRangeRef.current = false;
            });
          }
          viewingLogicalRangeRef.current = {
            from: 0,
            to: sorted.length - 1,
            barCount: sorted.length,
          };
        }

        lastAppliedFocusRevisionRef.current = focusRevision;
        lastAppliedTickerRef.current = ticker;
      } else if (isTickerSwitch) {
        // Branch B: Stock Switch - Carry over actual viewing scope
        // Re-enable vertical auto-scaling for new stock
        chart.applyOptions({
          rightPriceScale: {
            autoScale: true,
          },
        });
        candleSeries.priceScale?.().applyOptions?.({ autoScale: true });
        chart.priceScale?.('right')?.applyOptions?.({ autoScale: true });

        const carryOver = priorViewingScope
          ? computeCarryOverLogicalRange(priorViewingScope, priorViewingScope.barCount, sorted.length)
          : null;

        if (carryOver && typeof timeScale.setVisibleLogicalRange === 'function') {
          isApplyingProgrammaticRangeRef.current = true;
          try {
            timeScale.setVisibleLogicalRange(carryOver);
          } finally {
            queueMicrotask(() => {
              isApplyingProgrammaticRangeRef.current = false;
            });
          }
          viewingLogicalRangeRef.current = {
            from: carryOver.from,
            to: carryOver.to,
            barCount: sorted.length,
          };
        } else {
          // Fallback if no prior scope or setVisibleLogicalRange unavailable
          const focusWindow = computeTimeframeFocusWindow(sorted, timeframe);
          if (focusWindow && typeof timeScale.setVisibleLogicalRange === 'function') {
            const fromIndex = Math.max(0, sorted.findIndex((c) => c.timestamp >= focusWindow.from));
            const toIndex = Math.max(fromIndex, sorted.length - 1);
            timeScale.setVisibleLogicalRange({ from: fromIndex, to: toIndex });
            viewingLogicalRangeRef.current = { from: fromIndex, to: toIndex, barCount: sorted.length };
          }
        }

        lastAppliedTickerRef.current = ticker;
      }
      // Branch C: Same stock background refresh, leave timeScale and rightPriceScale untouched!
    }
    setViewportRevision((rev) => rev + 1);
  }, [ticker, timeframe, sortedCandles, focusRevision, computedIndicators]);

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
  const { pricePolylinePoints } = useMemo(() => {
    if (
      !chartApiRef.current ||
      !candleSeriesRef.current ||
      dimensions.width === 0 ||
      dimensions.height === 0 ||
      sortedCandles.length === 0
    ) {
      hoverCandidatesRef.current = [];
      return { pricePolylinePoints: '' };
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

    hoverCandidatesRef.current = candidates;
    return {
      pricePolylinePoints: svgCoords.join(' '),
    };
  }, [
    activeIndicators,
    intradayPricePoints,
    sortedCandles,
    dimensions,
    viewportRevision,
  ]);

  const projector: CoordinateProjector = {
    logicalToScreen(anchor: LogicalAnchor): ScreenPoint | null {
      const chart = chartApiRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) {
        return null;
      }
      let x: number | null = chart
        .timeScale()
        .timeToCoordinate(anchor.timestamp as UTCTimestamp) as number | null;
      const y = series.priceToCoordinate(anchor.price);
      if (y === null) {
        return null;
      }

      // If exact timestamp didn't hit a bar in Lightweight Charts (e.g. off-hour click, weekend, or timeframe mismatch),
      // smoothly interpolate or snap to nearest candle so drawing lines and annotations are ALWAYS visible:
      if (x === null && sortedCandles.length > 0) {
        const timeScale = chart.timeScale();
        const { left: leftCandle, right: rightCandle } = findSurroundingCandles(
          sortedCandles,
          anchor.timestamp
        );

        if (leftCandle && rightCandle) {
          if (leftCandle === rightCandle || leftCandle.timestamp === rightCandle.timestamp) {
            const coord = timeScale.timeToCoordinate(leftCandle.timestamp as UTCTimestamp);
            x = coord !== null ? Number(coord) : null;
          } else {
            const x1 = timeScale.timeToCoordinate(leftCandle.timestamp as UTCTimestamp);
            const x2 = timeScale.timeToCoordinate(rightCandle.timestamp as UTCTimestamp);
            if (x1 !== null && x2 !== null) {
              const fraction =
                (anchor.timestamp - leftCandle.timestamp) /
                (rightCandle.timestamp - leftCandle.timestamp);
              x = Number(x1) + fraction * (Number(x2) - Number(x1));
            }
          }
        } else if (leftCandle) {
          const coord = timeScale.timeToCoordinate(leftCandle.timestamp as UTCTimestamp);
          x = coord !== null ? Number(coord) : null;
        } else if (rightCandle) {
          const coord = timeScale.timeToCoordinate(rightCandle.timestamp as UTCTimestamp);
          x = coord !== null ? Number(coord) : null;
        }
      }

      if (x === null) {
        return null;
      }
      return { x, y: Number(y) };
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
      className={`relative h-full w-full flex-1 bg-slate-950 select-none overflow-hidden ${
        isDraggingChart ? 'cursor-grabbing [&_*]:!cursor-grabbing' : 'cursor-default'
      }`}
      onMouseDownCapture={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (!containerRef.current || !containerRef.current.contains(target)) return;

        // Ensure click originated inside chart pane (not on price scale or time scale)
        const rect = containerRef.current.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const priceAxisWidth = chartApiRef.current?.priceScale?.('right')?.width?.() ?? 60;
        const timeAxisHeight = 26;
        if (localX >= rect.width - priceAxisWidth || localY >= rect.height - timeAxisHeight) {
          return;
        }

        const chart = chartApiRef.current;
        if (!chart) return;

        const rightScale = chart.priceScale?.('right');
        const wasAutoScale = rightScale?.options?.()?.autoScale ?? true;

        // Unlock vertical autoScale so lightweight-charts native scroll can pan vertically
        rightScale?.applyOptions?.({ autoScale: false });
        rightScale?.setAutoScale?.(false);

        isDraggingChartRef.current = true;
        setIsDraggingChart(true);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'grabbing';
        }

        const startY = e.clientY;
        let hasPannedVertically = false;

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
          if (!isDraggingChartRef.current) return;
          if (Math.abs(moveEvent.clientY - startY) >= 3) {
            hasPannedVertically = true;
          }
          setViewportRevision((rev) => rev + 1);
        };

        const handleWindowMouseUp = () => {
          window.removeEventListener('mousemove', handleWindowMouseMove);
          window.removeEventListener('mouseup', handleWindowMouseUp);
          if (typeof document !== 'undefined') {
            document.body.style.cursor = '';
          }
          isDraggingChartRef.current = false;
          setIsDraggingChart(false);
          if (!hasPannedVertically && wasAutoScale) {
            rightScale?.setAutoScale?.(true);
            rightScale?.applyOptions?.({ autoScale: true });
          }
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const nearest = findNearestHoverPoint(cursorX, hoverCandidatesRef.current);
        const prev = activeHoverPointRef.current;
        const isSame =
          prev === nearest ||
          (prev !== null &&
            nearest !== null &&
            prev.timestamp === nearest.timestamp &&
            prev.price === nearest.price &&
            prev.source === nearest.source &&
            prev.x === nearest.x &&
            prev.y === nearest.y);
        if (!isSame) {
          activeHoverPointRef.current = nearest;
          setActiveHoverPoint(nearest);
        }
      }}
      onMouseLeave={() => {
        if (activeHoverPointRef.current !== null) {
          activeHoverPointRef.current = null;
          setActiveHoverPoint(null);
        }
      }}
    >
      {/* Lightweight Charts Mount Node */}
      <div
        ref={containerRef}
        data-testid="chart-pane"
        className={`h-full w-full ${isDraggingChart ? 'cursor-grabbing' : 'cursor-default'}`}
      />

      {/* Watermark badge */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/75 px-3 py-1.5 backdrop-blur-sm">
        <span className="font-mono text-sm font-bold tracking-wider text-slate-100">
          {ticker}
        </span>
        <span className="text-xs text-slate-400">
          {candles.length} bars
        </span>
      </div>

      {/* Technical Indicators Pill Toolbar & Live Readout */}
      <IndicatorToolbar
        activeIndicators={activeIndicators}
        onToggleIndicator={handleToggleIndicator}
        summary={computedIndicators.summary}
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
      {isLoading && sortedCandles.length === 0 && (
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
