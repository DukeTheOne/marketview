import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAnnotationStore,
  createTradeJournalStore,
  createWatchlistStore,
} from '../index';
import { runMobileSimulation } from '../../mobile/mobileRunner';

describe('Mobile Core Portability & Headless Execution', () => {
  it('enforces zero DOM globals and strictly headless runtime invariants', () => {
    // Assert standard browser globals do not exist in the headless environment
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');

    // Statically inspect mobileRunner.ts source for forbidden browser/UI imports
    const mobileRunnerPath = resolve(__dirname, '../../mobile/mobileRunner.ts');
    const source = readFileSync(mobileRunnerPath, 'utf-8');
    const codeWithoutCommentsAndStrings = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '');

    const forbiddenPatterns = [
      { pattern: /from\s+['"]react(-dom)?['"]/, reason: 'React/ReactDOM import' },
      { pattern: /from\s+['"]lightweight-charts['"]/, reason: 'lightweight-charts import' },
      { pattern: /from\s+['"][^'"]*\/(ui|features)\//, reason: 'src/ui or src/features import' },
      {
        pattern: /\b(window|document|localStorage|HTMLElement)\b/,
        reason: 'Browser DOM global reference',
      },
    ];

    for (const { pattern, reason } of forbiddenPatterns) {
      expect(
        pattern.test(codeWithoutCommentsAndStrings),
        `Forbidden ${reason} detected in mobileRunner.ts`
      ).toBe(false);
    }
  });

  it('runs the full mobile simulation and verifies exact trading, annotation, and watchlist parity', async () => {
    const result = await runMobileSimulation({ silent: true });

    // 1. Verify Active Ticker & Market Data
    expect(result.activeTicker).toBe('NVDA');
    expect(result.activeTimeframe).toBe('1D');
    expect(result.quote).toBeDefined();
    expect(result.quote.ticker).toBe('NVDA');
    expect(result.quote.price).toBeGreaterThan(0);
    expect(result.candles.length).toBe(120);

    // 2. Verify Watchlist Operations
    expect(result.createdWatchlist.name).toBe('Mobile Tech Picks');
    expect(result.createdWatchlist.tickers).toEqual(['NVDA', 'AAPL', 'MSFT']);
    expect(result.allWatchlists.length).toBe(3); // Seeded (2) + Custom (1)
    expect(result.watchlistStore.getState().activeWatchlistId).toBe(
      result.createdWatchlist.id
    );

    // 3. Verify Logical Chart Annotations (Coordinate Purity: Logical price & timestamp only)
    expect(result.stickerAnnotation.ticker).toBe('NVDA');
    expect(result.stickerAnnotation.type).toBe('sticker');
    expect(result.stickerAnnotation.anchors).toHaveLength(1);
    expect(result.stickerAnnotation.anchors[0]?.price).toBe(130.0);
    expect(result.stickerAnnotation.payload.markdown).toBe(
      'Mobile chart key level'
    );

    expect(result.trendlineAnnotation.ticker).toBe('NVDA');
    expect(result.trendlineAnnotation.type).toBe('trendline');
    expect(result.trendlineAnnotation.anchors).toHaveLength(2);
    expect(result.trendlineAnnotation.anchors[0]?.price).toBe(120.0);
    expect(result.trendlineAnnotation.anchors[1]?.price).toBe(138.0);
    expect(result.allAnnotations).toHaveLength(2);

    // 4. Verify Trade Journal Lifecycle & Performance KPIs
    expect(result.executedTrade.ticker).toBe('NVDA');
    expect(result.executedTrade.side).toBe('BUY');
    expect(result.executedTrade.entryPrice).toBe(125.0);
    expect(result.executedTrade.exitPrice).toBe(138.0);
    expect(result.executedTrade.quantity).toBe(100);
    expect(result.executedTrade.status).toBe('CLOSED');
    expect(result.executedTrade.linkedAnnotationId).toBe(
      result.stickerAnnotation.id
    );

    // P&L calculation: (138 - 125) * 100 = +1300
    expect(result.summary.totalTrades).toBe(1);
    expect(result.summary.openTrades).toBe(0);
    expect(result.summary.closedTrades).toBe(1);
    expect(result.summary.winCount).toBe(1);
    expect(result.summary.lossCount).toBe(0);
    expect(result.summary.winRatePercent).toBe(100.0);
    expect(result.summary.totalRealizedPnL).toBe(1300.0);
    expect(result.summary.profitFactor).toBeGreaterThanOrEqual(99.0);

    // 5. Verify In-Memory Storage Repository Parity (persistence hydration check)
    const repoWatchlists = await result.repository.getWatchlists();
    expect(repoWatchlists).toHaveLength(3);

    const repoAnnotations = await result.repository.getAnnotations('NVDA');
    expect(repoAnnotations).toHaveLength(2);

    const repoTrades = await result.repository.getTrades('NVDA');
    expect(repoTrades).toHaveLength(1);
    expect(repoTrades[0]?.status).toBe('CLOSED');
    expect(repoTrades[0]?.exitPrice).toBe(138.0);

    // 6. Cross-Store Hydration Rehydration Test
    // Simulates an app restart hydrating new store instances from the existing repository
    const freshWatchlistStore = createWatchlistStore(result.repository);
    await freshWatchlistStore.getState().hydrate();
    expect(freshWatchlistStore.getState().watchlists).toHaveLength(3);

    const freshAnnotationStore = createAnnotationStore(result.repository);
    await freshAnnotationStore.getState().hydrate();
    expect(freshAnnotationStore.getState().annotations).toHaveLength(2);

    const freshTradeStore = createTradeJournalStore(result.repository);
    await freshTradeStore.getState().hydrate();
    expect(freshTradeStore.getState().trades).toHaveLength(1);
    expect(freshTradeStore.getState().getSummary().totalRealizedPnL).toBe(1300.0);
  });
});
