import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const ROOT_DIR = path.resolve(process.cwd());

interface ProdServerInstance extends http.Server {
  distDir: string;
  port: number;
  rewriteYahooProxyPath: (rawUrl: string) => string | null;
  clearCache: () => void;
}

interface ProdServerModule {
  YAHOO_UPSTREAM_HOSTS: string[];
  YAHOO_USER_AGENT: string;
  QUOTE_TTL_MS: number;
  CANDLE_TTL_MS: number;
  MIME_TYPES: Record<string, string>;
  rewriteYahooProxyPath: (rawUrl: string) => string | null;
  getYahooCacheTtlMs: (upstreamPath: string) => number;
  createMarketViewServer: (options?: {
    distDir?: string;
    port?: number;
    fetchImpl?: typeof fetch;
  }) => ProdServerInstance;
}

interface YahooServerlessModule {
  CACHE_CONTROL_HEADER: string;
  resolveYahooUpstreamPath: (req: {
    url?: string;
    query?: Record<string, string | string[] | undefined>;
  }) => string;
  default: (
    req: { url?: string; query?: Record<string, string | string[] | undefined> },
    res: undefined,
    fetchImpl?: typeof fetch,
  ) => Promise<Response>;
}

async function importProdServer(): Promise<ProdServerModule> {
  const moduleUrl = pathToFileURL(path.join(ROOT_DIR, 'scripts/prod-server.mjs')).href;
  return (await import(moduleUrl)) as ProdServerModule;
}

async function importYahooApi(): Promise<YahooServerlessModule> {
  const moduleUrl = pathToFileURL(path.join(ROOT_DIR, 'api/yahoo.mjs')).href;
  return (await import(moduleUrl)) as YahooServerlessModule;
}

async function dispatchServerRequest(
  server: http.Server,
  reqOptions: { method?: string; url: string },
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const reqStream = new Readable({
      read() {
        this.push(null);
      },
    });
    const req = Object.assign(reqStream, {
      method: reqOptions.method ?? 'GET',
      url: reqOptions.url,
      headers: {},
    }) as unknown as http.IncomingMessage;

    const headers: Record<string, string> = {};
    let statusCode = 200;
    const chunks: Buffer[] = [];

    const res = {
      writeHead(code: number, hdrs?: Record<string, string>) {
        statusCode = code;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            headers[k.toLowerCase()] = String(v);
          }
        }
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = String(value);
      },
      end(chunk?: string | Buffer) {
        if (chunk !== undefined) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        resolve({
          statusCode,
          headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      },
    } as unknown as http.ServerResponse;

    try {
      server.emit('request', req, res);
    } catch (err) {
      reject(err);
    }
  });
}

describe('Production Release Packaging, Cloud Proxy & PWA Manifest', () => {
  it('validates public/manifest.webmanifest and public/icon.svg for installable PWA support', async () => {
    const manifestRaw = await fs.readFile(
      path.join(ROOT_DIR, 'public/manifest.webmanifest'),
      'utf-8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      name: string;
      short_name: string;
      display: string;
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };

    expect(manifest.name).toBe('MarketView');
    expect(manifest.short_name).toBe('MarketView');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#020617');
    expect(manifest.theme_color).toBe('#020617');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }),
      ]),
    );

    const iconSvg = await fs.readFile(path.join(ROOT_DIR, 'public/icon.svg'), 'utf-8');
    expect(iconSvg).toContain('<svg');
    expect(iconSvg).toContain('#020617');
    expect(iconSvg).toContain('#10b981');
  });

  it('validates vercel.json cloud proxy rewrite and SPA fallback routing', async () => {
    const vercelRaw = await fs.readFile(path.join(ROOT_DIR, 'vercel.json'), 'utf-8');
    const vercelConfig = JSON.parse(vercelRaw) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(Array.isArray(vercelConfig.rewrites)).toBe(true);
    expect(vercelConfig.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: '/api/yahoo/(.*)',
          destination: '/api/yahoo.mjs?path=$1',
        },
        expect.objectContaining({
          destination: '/index.html',
        }),
      ]),
    );
  });

  it('links manifest, SVG icon, and theme-color meta tag in index.html', async () => {
    const indexHtml = await fs.readFile(path.join(ROOT_DIR, 'index.html'), 'utf-8');

    expect(indexHtml).toContain('<meta name="theme-color" content="#020617" />');
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg" />');
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });

  it('exposes npm start in package.json pointing to scripts/prod-server.mjs', async () => {
    const pkgRaw = await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.start).toBe('node scripts/prod-server.mjs');
  });

  it('rewrites /api/yahoo/* paths and performs failover + caching in scripts/prod-server.mjs', async () => {
    const {
      createMarketViewServer,
      rewriteYahooProxyPath,
      getYahooCacheTtlMs,
      QUOTE_TTL_MS,
      CANDLE_TTL_MS,
    } = await importProdServer();

    expect(rewriteYahooProxyPath('/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1mo')).toBe(
      '/v8/finance/chart/AAPL?interval=1d&range=1mo',
    );
    expect(rewriteYahooProxyPath('/api/yahoo/v7/finance/quote?symbols=NVDA')).toBe(
      '/v7/finance/quote?symbols=NVDA',
    );
    expect(rewriteYahooProxyPath('/watchlist')).toBeNull();

    expect(getYahooCacheTtlMs('/v7/finance/quote?symbols=AAPL')).toBe(QUOTE_TTL_MS);
    expect(getYahooCacheTtlMs('/v8/finance/chart/AAPL?interval=1d&range=3mo')).toBe(CANDLE_TTL_MS);

    const tempDistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marketview-dist-'));
    await fs.writeFile(
      path.join(tempDistDir, 'index.html'),
      '<!doctype html><html><body>MarketView SPA</body></html>',
      'utf-8',
    );

    try {
      const mockPayload = JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL' } }] } });
      const fetchMock = vi
        .fn<typeof fetch>()
        // 1st call (query1) fails -> triggers failover to query2
        .mockResolvedValueOnce(new Response('Upstream 1 error', { status: 503 }))
        // 2nd call (query2) succeeds
        .mockResolvedValueOnce(
          new Response(mockPayload, {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          }),
        );

      const server = createMarketViewServer({
        distDir: tempDistDir,
        port: 0,
        fetchImpl: fetchMock,
      });

      const firstRes = await dispatchServerRequest(server, {
        url: '/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1mo',
      });
      expect(firstRes.statusCode).toBe(200);
      expect(firstRes.headers['x-marketview-cache']).toBe('MISS');
      expect(firstRes.body).toBe(mockPayload);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1mo',
      );
      expect(fetchMock.mock.calls[1]?.[0]).toContain(
        'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1mo',
      );

      // Cached hit within TTL
      const secondRes = await dispatchServerRequest(server, {
        url: '/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1mo',
      });
      expect(secondRes.statusCode).toBe(200);
      expect(secondRes.headers['x-marketview-cache']).toBe('HIT');
      expect(secondRes.body).toBe(mockPayload);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // SPA fallback for client route
      const spaRes = await dispatchServerRequest(server, { url: '/journal' });
      expect(spaRes.statusCode).toBe(200);
      expect(spaRes.headers['content-type']).toContain('text/html');
      expect(spaRes.body).toContain('MarketView SPA');
    } finally {
      await fs.rm(tempDistDir, { recursive: true, force: true });
    }
  });

  it('forwards serverless /api/yahoo/* requests with Cache-Control in api/yahoo.mjs', async () => {
    const { default: handler, resolveYahooUpstreamPath, CACHE_CONTROL_HEADER } =
      await importYahooApi();

    expect(
      resolveYahooUpstreamPath({
        url: '/api/yahoo.mjs?path=v8/finance/chart/MSFT&interval=1d&range=1mo',
      }),
    ).toBe('/v8/finance/chart/MSFT?interval=1d&range=1mo');

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await handler(
      { url: '/api/yahoo.mjs?path=v8/finance/chart/MSFT&interval=1d&range=1mo' },
      undefined,
      fetchMock,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(CACHE_CONTROL_HEADER);
    expect(await response.json()).toEqual({ ok: true });
  });
});
