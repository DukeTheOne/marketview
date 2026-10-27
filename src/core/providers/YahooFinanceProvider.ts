import { z } from 'zod';
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
import type { HttpFetcher } from './FinnhubProvider';
import type {
  CandleQueryOptions,
  MarketDataProvider,
} from './MarketDataProvider';

const YahooQuoteIndicatorSchema = z.object({
  open: z.array(z.number().nullable()).optional(),
  high: z.array(z.number().nullable()).optional(),
  low: z.array(z.number().nullable()).optional(),
  close: z.array(z.number().nullable()).optional(),
  volume: z.array(z.number().nullable()).optional(),
});

const YahooChartResultSchema = z.object({
  meta: z.object({
    symbol: z.string().optional(),
    regularMarketPrice: z.number(),
    chartPreviousClose: z.number().nullable().optional(),
    previousClose: z.number().nullable().optional(),
    regularMarketDayHigh: z.number().nullable().optional(),
    regularMarketDayLow: z.number().nullable().optional(),
    regularMarketTime: z.number().nullable().optional(),
  }),
  timestamp: z.array(z.number().nullable()).optional(),
  indicators: z
    .object({
      quote: z.array(YahooQuoteIndicatorSchema).optional(),
    })
    .optional(),
});

const YahooChartResponseSchema = z.object({
  chart: z.object({
    result: z.array(YahooChartResultSchema).nullable().optional(),
    error: z.unknown().nullable().optional(),
  }),
});

const YahooSearchResponseSchema = z.object({
  quotes: z
    .array(
      z.object({
        symbol: z.string().optional(),
        shortname: z.string().nullable().optional(),
        longname: z.string().nullable().optional(),
        exchDisp: z.string().nullable().optional(),
        exchange: z.string().nullable().optional(),
      })
    )
    .optional()
    .default([]),
});

const YAHOO_TIMEFRAME_MAP: Record<
  Timeframe,
  { interval: string; range: string }
> = {
  '15m': { interval: '15m', range: '5d' },
  '1h': { interval: '60m', range: '1mo' },
  '1D': { interval: '1d', range: '6mo' },
  '1W': { interval: '1wk', range: '2y' },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function findLatestPositive(
  values: ReadonlyArray<number | null> | undefined
): number | undefined {
  if (!values) {
    return undefined;
  }
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const val = values[i];
    if (val !== null && val !== undefined && Number.isFinite(val) && val > 0) {
      return val;
    }
  }
  return undefined;
}

/**
 * Zero-API-key Yahoo Finance v8/v1 adapter implementing MarketDataProvider.
 * Uses `/api/yahoo` proxy by default in browser builds or direct Yahoo URL in Node/tests.
 */
export class YahooFinanceProvider implements MarketDataProvider {
  public readonly id = 'yahoo-finance';
  private readonly fetcher: HttpFetcher;
  private readonly baseUrl: string;
  private readonly recentCandleQuotes = new Map<
    string,
    { quote: TickerQuote; expiresAt: number }
  >();

  constructor(fetcher?: HttpFetcher, baseUrl = '/api/yahoo') {
    this.fetcher = fetcher ?? ((url: string) => globalThis.fetch(url));
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async getQuote(rawTicker: string): Promise<TickerQuote> {
    const ticker = TickerSymbolSchema.parse(rawTicker);
    const cachedFromCandles = this.recentCandleQuotes.get(ticker);
    if (cachedFromCandles && cachedFromCandles.expiresAt > Date.now()) {
      return cachedFromCandles.quote;
    }

    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`Yahoo Finance quote request failed (${response.status})`);
    }
    const rawJson = await response.json();
    const parsed = YahooChartResponseSchema.parse(rawJson);
    const result = parsed.chart.result?.[0];
    if (!result) {
      throw new Error(`Yahoo Finance returned no quote result for ${ticker}`);
    }

    return this.extractQuoteFromResult(ticker, result);
  }

  private extractQuoteFromResult(
    ticker: string,
    result: z.infer<typeof YahooChartResultSchema>
  ): TickerQuote {
    const { meta } = result;
    const quoteIndicator = result.indicators?.quote?.[0];
    const latestValidHigh = findLatestPositive(quoteIndicator?.high);
    const latestValidLow = findLatestPositive(quoteIndicator?.low);
    const latestValidOpen = findLatestPositive(quoteIndicator?.open);

    const price = round2(meta.regularMarketPrice);
    const previousClose = round2(
      meta.chartPreviousClose ?? meta.previousClose ?? price
    );
    const change = round2(price - previousClose);
    const changePercent =
      previousClose > 0 ? round2(((price - previousClose) / previousClose) * 100) : 0;
    const high = round2(
      meta.regularMarketDayHigh ?? latestValidHigh ?? price
    );
    const low = round2(meta.regularMarketDayLow ?? latestValidLow ?? price);
    const open = round2(latestValidOpen ?? previousClose ?? price);
    const timestamp =
      meta.regularMarketTime && meta.regularMarketTime > 0
        ? Math.floor(meta.regularMarketTime)
        : Math.floor(Date.now() / 1000);

    return TickerQuoteSchema.parse({
      ticker,
      price,
      change,
      changePercent,
      high,
      low,
      open,
      previousClose,
      timestamp,
    });
  }

  public async getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]> {
    const ticker = TickerSymbolSchema.parse(options.ticker);
    const limit = options.limit ?? 120;
    const { interval, range } = YAHOO_TIMEFRAME_MAP[options.timeframe];

    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(
        `Yahoo Finance candle request failed (${response.status})`
      );
    }
    const rawJson = await response.json();
    const parsed = YahooChartResponseSchema.parse(rawJson);
    const result = parsed.chart.result?.[0];
    if (result) {
      try {
        const extractedQuote = this.extractQuoteFromResult(ticker, result);
        this.recentCandleQuotes.set(ticker, {
          quote: extractedQuote,
          expiresAt: Date.now() + 10_000,
        });
      } catch {
        // Ignore meta quote extraction errors during candle parsing
      }
    }
    const timestamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];

    if (!timestamps || !quote) {
      return [];
    }

    const candles: OHLCVCandle[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const timestamp = timestamps[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const rawVolume = quote.volume?.[i];

      if (
        timestamp !== null &&
        timestamp !== undefined &&
        timestamp > 0 &&
        open !== null &&
        open !== undefined &&
        open > 0 &&
        high !== null &&
        high !== undefined &&
        high > 0 &&
        low !== null &&
        low !== undefined &&
        low > 0 &&
        close !== null &&
        close !== undefined &&
        close > 0
      ) {
        const volume =
          rawVolume !== null && rawVolume !== undefined && rawVolume >= 0
            ? Math.round(rawVolume)
            : 0;
        candles.push(
          OHLCVCandleSchema.parse({
            timestamp: Math.floor(timestamp),
            open: round2(open),
            high: round2(high),
            low: round2(low),
            close: round2(close),
            volume,
          })
        );
      }
    }

    return candles.slice(-limit);
  }

  public async searchTickers(query: string): Promise<TickerSearchResult[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    const url = `${this.baseUrl}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(
        `Yahoo Finance search request failed (${response.status})`
      );
    }
    const rawJson = await response.json();
    const parsed = YahooSearchResponseSchema.parse(rawJson);

    const results: TickerSearchResult[] = [];
    for (const item of parsed.quotes) {
      if (item.symbol && /^[A-Z.]{1,12}$/.test(item.symbol)) {
        results.push(
          TickerSearchResultSchema.parse({
            ticker: item.symbol,
            name: item.shortname || item.longname || item.symbol,
            exchange: item.exchDisp || item.exchange || 'US',
          })
        );
        if (results.length >= 10) {
          break;
        }
      }
    }
    return results;
  }
}
