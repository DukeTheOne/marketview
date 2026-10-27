import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Clean server-side middleware for `/api/yahoo/*` that:
 * 1. Performs clean Node.js `fetch()` with only `User-Agent: Mozilla/5.0`
 *    (stripping browser `Origin`, `Referer`, `Cookie`, and `Sec-Fetch-*` headers
 *    that cause Yahoo Finance's edge server to reject proxied browser requests).
 * 2. Caches responses in Node memory (10s for quotes, 45s for candles/search)
 *    and deduplicates concurrent in-flight requests to prevent HTTP 429 burst blocks.
 * 3. Automatically fails over between `query1.finance.yahoo.com` and `query2.finance.yahoo.com`,
 *    and serves last-known-good cached real data if upstream ever blips.
 */
function yahooFinanceApiPlugin(): Plugin {
  const cache = new Map<string, { body: string; expiresAt: number }>();
  const inFlight = new Map<string, Promise<string>>();

  const UPSTREAMS = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  async function fetchFromYahoo(targetPath: string): Promise<string> {
    let lastError: Error | null = null;
    for (const host of UPSTREAMS) {
      try {
        const res = await fetch(`${host}${targetPath}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json',
          },
        });
        if (res.ok) {
          return await res.text();
        }
        lastError = new Error(`Yahoo upstream ${host} returned HTTP ${res.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error('All Yahoo Finance upstreams failed');
  }

  const middleware = async (
    req: { url?: string },
    res: {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(body: string): void;
    },
    next: () => void
  ) => {
    if (!req.url || !req.url.startsWith('/api/yahoo/')) {
      next();
      return;
    }

    const targetPath = req.url.replace(/^\/api\/yahoo/, '');
    const now = Date.now();
    const existing = cache.get(targetPath);

    if (existing && existing.expiresAt > now) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-MarketView-Cache', 'HIT');
      res.end(existing.body);
      return;
    }

    let promise = inFlight.get(targetPath);
    if (!promise) {
      promise = fetchFromYahoo(targetPath).finally(() => {
        inFlight.delete(targetPath);
      });
      inFlight.set(targetPath, promise);
    }

    try {
      const body = await promise;
      const isQuotePoll =
        targetPath.includes('range=5d') && targetPath.includes('interval=1d');
      const ttlMs = isQuotePoll ? 10_000 : 45_000;
      cache.set(targetPath, { body, expiresAt: Date.now() + ttlMs });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-MarketView-Cache', 'MISS');
      res.end(body);
    } catch (err) {
      // If upstream transiently fails, serve stale real data if available
      if (existing) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-MarketView-Cache', 'STALE');
        res.end(existing.body);
        return;
      }
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Yahoo upstream error',
        })
      );
    }
  };

  return {
    name: 'marketview-yahoo-finance-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), yahooFinanceApiPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
