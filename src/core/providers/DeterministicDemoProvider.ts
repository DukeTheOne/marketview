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
  '1W': 7 * 24 * 60 * 60,
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

/**
 * Deterministic, zero-API-key market data provider that generates realistic,
 * reproducible OHLCV candles and quotes for any ticker symbol.
 */
export class DeterministicDemoProvider implements MarketDataProvider {
  public readonly id = 'deterministic-demo';
  private readonly anchorTimestampSec: number;

  constructor(anchorTimestampSec = 1729728000) {
    // Fixed default anchor epoch so candlestick series are stable across renders & tests
    this.anchorTimestampSec = anchorTimestampSec;
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

  public async getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]> {
    const ticker = TickerSymbolSchema.parse(options.ticker);
    const count = Math.max(2, options.limit ?? 120);
    const stepSeconds = TIMEFRAME_SECONDS[options.timeframe];
    const catalogEntry = DEMO_CATALOG.find((item) => item.ticker === ticker);

    let seed = hashSeed(`${ticker}:${options.timeframe}`);
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
