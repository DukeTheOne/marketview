import {
  OHLCVCandleSchema,
  TickerQuoteSchema,
  TickerSearchResultSchema,
  TickerSymbolSchema,
  type OHLCVCandle,
  type TickerQuote,
  type TickerSearchResult,
  type Timeframe,
} from '../schemas/market';
import type {
  CandleQueryOptions,
  MarketDataProvider,
} from './MarketDataProvider';

interface CatalogInstrument {
  ticker: string;
  name: string;
  exchange: string;
  basePrice: number;
  volatility: number;
}

const DEMO_CATALOG: CatalogInstrument[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', basePrice: 228.5, volatility: 0.014 },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', basePrice: 138.2, volatility: 0.024 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', basePrice: 442.8, volatility: 0.012 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', basePrice: 210.4, volatility: 0.017 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', basePrice: 186.9, volatility: 0.015 },
  { ticker: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', basePrice: 592.0, volatility: 0.02 },
  { ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', basePrice: 258.7, volatility: 0.031 },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE ARCA', basePrice: 584.3, volatility: 0.008 },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', basePrice: 503.1, volatility: 0.011 },
  { ticker: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ', basePrice: 156.4, volatility: 0.026 },
];

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1D': 24 * 60 * 60,
  '1W': 24 * 60 * 60,
  '1M': 24 * 60 * 60,
  '3M': 24 * 60 * 60,
  '6M': 24 * 60 * 60,
  '1Y': 24 * 60 * 60,
};

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextPseudoRandom(seed: number): [number, number] {
  let state = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const normalized = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [normalized, state >>> 0];
}

function roundPrice(val: number): number {
  return Math.max(0.01, Math.round(val * 100) / 100);
}

const DEFAULT_TEST_ANCHOR = 1729728000;

/**
 * Deterministic, zero-API-key market data provider that generates realistic,
 * reproducible OHLCV candles and quotes for any ticker symbol.
 */
export class DeterministicDemoProvider implements MarketDataProvider {
  public readonly id = 'deterministic-demo';
  private readonly anchorTimestampSec: number;

  constructor(anchorTimestampSec?: number) {
    if (anchorTimestampSec !== undefined) {
      this.anchorTimestampSec = anchorTimestampSec;
    } else if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'test'
    ) {
      // Fixed default anchor epoch in automated tests so candlestick series are stable across test assertions
      this.anchorTimestampSec = DEFAULT_TEST_ANCHOR;
    } else {
      // In live browser usage, anchor candles to the current day so drawings and notes align accurately with today's timescale
      this.anchorTimestampSec = Math.floor(Date.now() / 1000);
    }
  }

  public async getQuote(rawTicker: string): Promise<TickerQuote> {
    const ticker = TickerSymbolSchema.parse(rawTicker);
    const candles = await this.getCandles({ ticker, timeframe: '1D', limit: 2 });
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? latest;

    if (!latest || !prev) {
      throw new Error(`Unable to generate quote for ${ticker}`);
    }

    const change = roundPrice(latest.close - prev.close);
    const changePercent =
      prev.close > 0 ? Math.round(((change / prev.close) * 100) * 100) / 100 : 0;

    return TickerQuoteSchema.parse({
      ticker,
      price: latest.close,
      change,
      changePercent,
      high: latest.high,
      low: latest.low,
      open: latest.open,
      previousClose: prev.close,
      timestamp: latest.timestamp,
    });
  }

  public async getCandles(
    optionsOrTicker: CandleQueryOptions | string,
    timeframeArg?: Timeframe,
    limitArg?: number
  ): Promise<OHLCVCandle[]> {
    const options: CandleQueryOptions =
      typeof optionsOrTicker === 'string'
        ? {
            ticker: optionsOrTicker,
            timeframe: timeframeArg ?? '1D',
            limit: limitArg,
          }
        : optionsOrTicker;

    const ticker = TickerSymbolSchema.parse(options.ticker);
    const count = Math.max(2, options.limit ?? 120);

    // If 15-minute timeframe is requested, sub-step the daily candles
    // so intraday price movements coherently match the daily candlestick OHLC.
    if (options.timeframe === '15m') {
      const neededDays = Math.max(2, Math.ceil(count / 16));
      const dailyCandles = await this.getCandles({
        ticker,
        timeframe: '1D',
        limit: neededDays,
      });

      const allIntraday: OHLCVCandle[] = [];
      for (const d of dailyCandles) {
        const dayStart = Math.floor(d.timestamp / 86400) * 86400;
        const baseTs =
          d.timestamp - 15 * 900 >= dayStart
            ? d.timestamp - 15 * 900
            : dayStart + 34200;

        let seed = hashSeed(`${ticker}:${d.timestamp}:15m`);
        const P: number[] = new Array(17).fill(0);
        P[0] = d.open;
        P[16] = d.close;

        const isBullish = d.close >= d.open;
        const lowIdx = isBullish ? 4 : 12;
        const highIdx = isBullish ? 12 : 4;
        P[lowIdx] = d.low;
        P[highIdx] = d.high;

        const keyIndices = [0, Math.min(lowIdx, highIdx), Math.max(lowIdx, highIdx), 16];
        for (let seg = 0; seg < 3; seg++) {
          const startIdx = keyIndices[seg]!;
          const endIdx = keyIndices[seg + 1]!;
          for (let i = startIdx + 1; i < endIdx; i++) {
            const t = (i - startIdx) / (endIdx - startIdx);
            const lerp = P[startIdx]! + t * (P[endIdx]! - P[startIdx]!);
            let rand: number;
            [rand, seed] = nextPseudoRandom(seed);
            const noise = (rand - 0.5) * 0.15 * (d.high - d.low);
            P[i] = roundPrice(Math.max(d.low, Math.min(d.high, lerp + noise)));
          }
        }

        for (let k = 0; k < 16; k++) {
          const barTimestamp = baseTs + k * 900;
          const barOpen = roundPrice(P[k]!);
          const barClose = roundPrice(P[k + 1]!);
          let barHigh = Math.max(barOpen, barClose);
          let barLow = Math.min(barOpen, barClose);

          if (k === highIdx || k + 1 === highIdx) {
            barHigh = d.high;
          }
          if (k === lowIdx || k + 1 === lowIdx) {
            barLow = d.low;
          }

          barHigh = Math.min(d.high, Math.max(barHigh, barOpen, barClose));
          barLow = Math.max(d.low, Math.min(barLow, barOpen, barClose));
          const barVolume = Math.max(100, Math.round(d.volume / 16));

          allIntraday.push(
            OHLCVCandleSchema.parse({
              timestamp: barTimestamp,
              open: barOpen,
              high: barHigh,
              low: barLow,
              close: barClose,
              volume: barVolume,
            })
          );
        }
      }

      return allIntraday.slice(-count);
    }

    const stepSeconds = TIMEFRAME_SECONDS[options.timeframe];
    const catalogEntry = DEMO_CATALOG.find((item) => item.ticker === ticker);

    const isDailyFocusScope = options.timeframe !== '1h';
    let seed = hashSeed(
      `${ticker}:${isDailyFocusScope ? '1D' : options.timeframe}`
    );
    const basePrice =
      catalogEntry?.basePrice ?? 50 + (hashSeed(ticker) % 350);
    const volatility = catalogEntry?.volatility ?? 0.018;

    const candles: OHLCVCandle[] = [];
    let currentClose = basePrice * 0.92;
    const startTimestamp = this.anchorTimestampSec - (count - 1) * stepSeconds;

    for (let i = 0; i < count; i += 1) {
      const timestamp = startTimestamp + i * stepSeconds;
      let r1: number;
      let r2: number;
      let r3: number;
      [r1, seed] = nextPseudoRandom(seed);
      [r2, seed] = nextPseudoRandom(seed);
      [r3, seed] = nextPseudoRandom(seed);

      const drift = 0.0006;
      const deltaPct = (r1 - 0.485) * 2 * volatility + drift;
      const open = roundPrice(currentClose);
      const close = roundPrice(open * (1 + deltaPct));
      const bodyMax = Math.max(open, close);
      const bodyMin = Math.min(open, close);
      const upperWick = roundPrice(bodyMax * (1 + r2 * volatility * 0.85));
      const lowerWick = roundPrice(bodyMin * (1 - r3 * volatility * 0.85));
      const volume = Math.round(850_000 + r1 * 4_200_000 + Math.abs(deltaPct) * 25_000_000);

      candles.push(
        OHLCVCandleSchema.parse({
          timestamp,
          open,
          high: Math.max(upperWick, bodyMax),
          low: Math.min(lowerWick, bodyMin),
          close,
          volume,
        })
      );
      currentClose = close;
    }

    return candles;
  }

  public async searchTickers(query: string): Promise<TickerSearchResult[]> {
    const q = query.trim().toUpperCase();
    if (!q) {
      return DEMO_CATALOG.slice(0, 6).map((item) =>
        TickerSearchResultSchema.parse(item)
      );
    }

    const matches = DEMO_CATALOG.filter(
      (item) =>
        item.ticker.includes(q) || item.name.toUpperCase().includes(q)
    );

    if (matches.length > 0) {
      return matches.map((item) => TickerSearchResultSchema.parse(item));
    }

    // Allow adding custom valid ticker symbols not in the preset list
    if (/^[A-Z.]{1,10}$/.test(q)) {
      return [
        TickerSearchResultSchema.parse({
          ticker: q,
          name: `${q} Equity`,
          exchange: 'US',
        }),
      ];
    }

    return [];
  }
}
