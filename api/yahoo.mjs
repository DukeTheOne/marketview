const YAHOO_UPSTREAM_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const CACHE_CONTROL_HEADER = 's-maxage=15, stale-while-revalidate=60';

/**
 * Resolves the target Yahoo Finance path + query string from either:
 * - Direct `/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=1mo`
 * - Rewritten `/api/yahoo.mjs?path=v8/finance/chart/AAPL&interval=1d&range=1mo`
 *
 * @param {{ url?: string; query?: Record<string, string | string[] | undefined> }} req
 * @returns {string}
 */
export function resolveYahooUpstreamPath(req) {
  const rawUrl = req?.url || '/';
  const parsed = new URL(rawUrl, 'https://marketview.local');

  let subPath = '';
  const queryPathParam = req?.query?.path ?? parsed.searchParams.get('path');

  if (queryPathParam) {
    subPath = Array.isArray(queryPathParam) ? queryPathParam.join('/') : String(queryPathParam);
    parsed.searchParams.delete('path');
  } else if (parsed.pathname.startsWith('/api/yahoo')) {
    subPath = parsed.pathname.slice('/api/yahoo'.length);
  } else {
    subPath = parsed.pathname;
  }

  const normalizedPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const search = parsed.searchParams.toString();
  return search ? `${normalizedPath}?${search}` : normalizedPath;
}

/**
 * Serverless proxy handler for `/api/yahoo/*` on Vercel / cloud hosting.
 * Forwards requests to `query1.finance.yahoo.com` and `query2.finance.yahoo.com`
 * with `User-Agent: Mozilla/5.0` and edge caching headers.
 */
export default async function handler(req, res, fetchImpl = globalThis.fetch) {
  const upstreamPath = resolveYahooUpstreamPath(req);
  let lastStatus = 502;
  let lastErrorText = 'Yahoo Finance upstream unavailable';

  for (const host of YAHOO_UPSTREAM_HOSTS) {
    const targetUrl = `${host}${upstreamPath}`;
    try {
      const upstreamRes = await fetchImpl(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': YAHOO_USER_AGENT,
          Accept: 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (upstreamRes.ok) {
        const body = await upstreamRes.text();
        const contentType =
          upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8';

        if (res && typeof res.setHeader === 'function') {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
          if (typeof res.status === 'function') {
            return res.status(upstreamRes.status).send(body);
          }
          res.statusCode = upstreamRes.status;
          return res.end(body);
        }

        return new Response(body, {
          status: upstreamRes.status,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': CACHE_CONTROL_HEADER,
          },
        });
      }

      lastStatus = upstreamRes.status;
      lastErrorText = `Upstream ${host} returned HTTP ${upstreamRes.status}`;
    } catch (err) {
      lastErrorText = err instanceof Error ? err.message : String(err);
    }
  }

  const errorPayload = JSON.stringify({
    error: 'Yahoo Finance upstream unavailable',
    details: lastErrorText,
  });

  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (typeof res.status === 'function') {
      return res.status(lastStatus).send(errorPayload);
    }
    res.statusCode = lastStatus;
    return res.end(errorPayload);
  }

  return new Response(errorPayload, {
    status: lastStatus,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
