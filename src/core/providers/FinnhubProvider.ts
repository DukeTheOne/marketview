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
import type {
  CandleQueryOptions,
  MarketDataProvider,
} from './MarketDataProvider';

const FinnhubQuoteResponseSchema = z.object({
  c: z.number(), // Current price
  d: z.number().nullable().optional(), // Change
  dp: z.number().nullable().optional(), // Percent change
  h: z.number(), // High price of the day
  l: z.number(), // Low price of the day
  o: z.number(), // Open price of the day
  pc: z.number(), // Previous close price
  t: z.number(), // Timestamp
});

const FinnhubCandleResponseSchema = z.object({
  s: z.string(),
  t: z.array(z.number()).optional(),
  o: z.array(z.number()).optional(),
  h: z.array(z.number()).optional(),
  l: z.array(z.number()).optional(),
  c: z.array(z.number()).optional(),
  v: z.array(z.number()).optional(),
});

const FinnhubSearchResponseSchema = z.object({
  result: z.array(
    z.object({
      symbol: z.string(),
      description: z.string(),
      type: z.string().optional(),
    })
  ),
});

export type HttpFetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const FINNHUB_RESOLUTION_MAP: Record<Timeframe, string> = {
  '15m': '15',
  '1h': '60',
  '1D': 'D',
  '1W': 'W',
};

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1D': 24 * 60 * 60,
  '1W': 7 * 24 * 60 * 60,
};

/**
 * Concrete Finnhub REST API adapter implementing MarketDataProvider.
 * All external responses are validated and normalized into domain schemas before returning.
 */
export class FinnhubProvider implements MarketDataProvider {
  public readonly id = 'finnhub';
  private readonly apiKey: string;
  private readonly fetcher: HttpFetcher;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    fetcher?: HttpFetcher,
    baseUrl = 'https://finnhub.io/api/v1'
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher ?? ((url: string) => globalThis.fetch(url));
    this.baseUrl = baseUrl;
  }

  public async getQuote(rawTicker: string): Promise<TickerQuote> {
    const ticker = TickerSymbolSchema.parse(rawTicker);
    const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`Finnhub quote request failed (${response.status})`);
    }
    const rawJson = await response.json();
    const parsed = FinnhubQuoteResponseSchema.parse(rawJson);

    return TickerQuoteSchema.parse({
      ticker,
      price: parsed.c,
      change: parsed.d ?? 0,
      changePercent: parsed.dp ?? 0,
      high: parsed.h,
      low: parsed.l,
      open: parsed.o,
      previousClose: parsed.pc,
      timestamp: parsed.t > 0 ? parsed.t : Math.floor(Date.now() / 1000),
    });
  }

  public async getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]> {
    const ticker = TickerSymbolSchema.parse(options.ticker);
    const limit = options.limit ?? 120;
    const resolution = FINNHUB_RESOLUTION_MAP[options.timeframe];
    const toSec = Math.floor(Date.now() / 1000);
    const fromSec = toSec - limit * TIMEFRAME_SECONDS[options.timeframe];

    const url = `${this.baseUrl}/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=${resolution}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`Finnhub candle request failed (${response.status})`);
    }
    const rawJson = await response.json();
    const parsed = FinnhubCandleResponseSchema.parse(rawJson);

    if (
      parsed.s !== 'ok' ||
      !parsed.t ||
      !parsed.o ||
      !parsed.h ||
      !parsed.l ||
      !parsed.c ||
      !parsed.v
    ) {
      return [];
    }

    const candles: OHLCVCandle[] = [];
    for (let i = 0; i < parsed.t.length; i += 1) {
      const timestamp = parsed.t[i];
      const open = parsed.o[i];
      const high = parsed.h[i];
      const low = parsed.l[i];
      const close = parsed.c[i];
      const volume = parsed.v[i];

      if (
        timestamp !== undefined &&
        open !== undefined &&
        high !== undefined &&
        low !== undefined &&
        close !== undefined &&
        volume !== undefined
      ) {
        candles.push(
          OHLCVCandleSchema.parse({
            timestamp,
            open,
            high,
            low,
            close,
            volume,
          })
        );
      }
    }
    return candles;
  }

  public async searchTickers(query: string): Promise<TickerSearchResult[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`Finnhub search request failed (${response.status})`);
    }
    const rawJson = await response.json();
    const parsed = FinnhubSearchResponseSchema.parse(rawJson);

    return parsed.result
      .filter((item) => /^[A-Z.]{1,12}$/.test(item.symbol))
      .slice(0, 10)
      .map((item) =>
        TickerSearchResultSchema.parse({
          ticker: item.symbol,
          name: item.description || item.symbol,
          exchange: 'US',
        })
      );
  }
}
