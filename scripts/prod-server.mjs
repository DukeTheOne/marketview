import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const YAHOO_UPSTREAM_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

export const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const QUOTE_TTL_MS = 10_000;
export const CANDLE_TTL_MS = 45_000;

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/**
 * Rewrites an incoming `/api/yahoo/*` request URL to the upstream Yahoo Finance path + query.
 * Returns null if the request URL does not target `/api/yahoo`.
 *
 * @param {string} rawUrl
 * @returns {string | null}
 */
export function rewriteYahooProxyPath(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('/api/yahoo')) {
    return null;
  }
  const stripped = rawUrl.slice('/api/yahoo'.length);
  if (!stripped || stripped === '/') {
    return '/';
  }
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

/**
 * Determines cache TTL (10s for quotes, 45s for historical candles).
 *
 * @param {string} upstreamPath
 * @returns {number}
 */
export function getYahooCacheTtlMs(upstreamPath) {
  if (
    upstreamPath.includes('/v7/finance/quote') ||
    (upstreamPath.includes('range=1d') && upstreamPath.includes('interval=1m'))
  ) {
    return QUOTE_TTL_MS;
  }
  if (upstreamPath.includes('/v8/finance/chart/')) {
    return CANDLE_TTL_MS;
  }
  return QUOTE_TTL_MS;
}

/**
 * Creates a standalone MarketView production HTTP server with:
 * - `/api/yahoo/*` resilient caching + failover proxy
 * - `dist/` static asset serving + SPA fallback to `dist/index.html`
 *
 * @param {{
 *   distDir?: string;
 *   port?: number;
 *   fetchImpl?: typeof fetch;
 * }} [options]
 */
export function createMarketViewServer(options = {}) {
  const distDir = path.resolve(options.distDir ?? path.resolve(process.cwd(), 'dist'));
  const port = Number(options.port ?? process.env.PORT ?? 4173);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  /** @type {Map<string, { body: string; status: number; contentType: string; timestamp: number; ttlMs: number }>} */
  const responseCache = new Map();
  /** @type {Map<string, Promise<{ body: string; status: number; contentType: string }>>} */
  const inFlightRequests = new Map();

  async function fetchFromYahooUpstream(upstreamPath) {
    let lastError = null;

    for (const host of YAHOO_UPSTREAM_HOSTS) {
      const targetUrl = `${host}${upstreamPath}`;
      try {
        const response = await fetchImpl(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': YAHOO_USER_AGENT,
            Accept: 'application/json,text/plain,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (response.ok) {
          const body = await response.text();
          const contentType =
            response.headers.get('content-type') || 'application/json; charset=utf-8';
          return {
            body,
            status: response.status,
            contentType,
          };
        }

        lastError = new Error(`Upstream ${host} responded with HTTP ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error('All Yahoo Finance upstream hosts failed');
  }

  async function handleYahooProxy(req, res, upstreamPath) {
    if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    const now = Date.now();
    const cached = responseCache.get(upstreamPath);
    if (cached && now - cached.timestamp < cached.ttlMs) {
      res.writeHead(cached.status, {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=45',
        'X-MarketView-Cache': 'HIT',
      });
      res.end(cached.body);
      return;
    }

    let requestPromise = inFlightRequests.get(upstreamPath);
    if (!requestPromise) {
      requestPromise = fetchFromYahooUpstream(upstreamPath).finally(() => {
        inFlightRequests.delete(upstreamPath);
      });
      inFlightRequests.set(upstreamPath, requestPromise);
    }

    try {
      const result = await requestPromise;
      const ttlMs = getYahooCacheTtlMs(upstreamPath);
      responseCache.set(upstreamPath, {
        body: result.body,
        status: result.status,
        contentType: result.contentType,
        timestamp: Date.now(),
        ttlMs,
      });

      res.writeHead(result.status, {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=45',
        'X-MarketView-Cache': 'MISS',
      });
      res.end(result.body);
    } catch (err) {
      // Stale-if-error fallback
      if (cached) {
        res.writeHead(cached.status, {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=5, stale-if-error=60',
          'X-MarketView-Cache': 'STALE',
        });
        res.end(cached.body);
        return;
      }

      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: 'Yahoo Finance upstream unavailable',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  async function handleStaticOrSpa(req, res) {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const decodedPathname = decodeURIComponent(parsedUrl.pathname);
    const relativePath = decodedPathname.replace(/^\/+/, '');
    const candidatePath = path.resolve(distDir, relativePath || 'index.html');

    // Prevent path traversal outside distDir
    if (!candidatePath.startsWith(distDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile()) {
        const ext = path.extname(candidatePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = await fs.readFile(candidatePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      }
    } catch {
      // File does not exist; determine whether to 404 (asset) or SPA fallback
    }

    const requestedExt = path.extname(decodedPathname).toLowerCase();
    if (requestedExt && requestedExt !== '.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const indexHtmlPath = path.join(distDir, 'index.html');
    try {
      const indexHtml = await fs.readFile(indexHtmlPath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      res.end(indexHtml);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('dist/index.html not found. Run `npm run build` first.');
    }
  }

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const upstreamYahooPath = rewriteYahooProxyPath(rawUrl);

    if (upstreamYahooPath !== null) {
      await handleYahooProxy(req, res, upstreamYahooPath);
      return;
    }

    await handleStaticOrSpa(req, res);
  });

  Object.assign(server, {
    distDir,
    port,
    rewriteYahooProxyPath,
    clearCache: () => responseCache.clear(),
  });

  return server;
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const port = Number(process.env.PORT || 4173);
  const server = createMarketViewServer({ port });
  server.listen(port, () => {
    console.log(`MarketView production server listening on http://localhost:${port}`);
  });
}
