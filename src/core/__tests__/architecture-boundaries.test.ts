import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ChartAnnotationSchema } from '../schemas/annotation';

const currentDir = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(currentDir, '..');

function collectTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry !== '__tests__') {
        files.push(...collectTypeScriptFiles(fullPath));
      }
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Headless Core Architectural Boundaries (TC-02 & TC-05)', () => {
  it('ensures zero files in src/core/** import UI, React, Lightweight-Charts, or browser DOM globals', () => {
    const coreFiles = collectTypeScriptFiles(coreRoot);
    expect(coreFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      { pattern: /from\s+['"]react(-dom)?['"]/, reason: 'React/ReactDOM import' },
      { pattern: /from\s+['"]lightweight-charts['"]/, reason: 'lightweight-charts import' },
      { pattern: /from\s+['"][^'"]*\/(ui|features)\//, reason: 'src/ui or src/features import' },
      { pattern: /\b(window|document|localStorage|HTMLElement)\b/, reason: 'Browser DOM global reference' },
    ];

    for (const filePath of coreFiles) {
      const source = readFileSync(filePath, 'utf-8');
      // Strip comments before scanning so docstrings mentioning window/document do not false-positive
      const codeWithoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const { pattern, reason } of forbiddenPatterns) {
        expect(
          pattern.test(codeWithoutComments),
          `Forbidden ${reason} detected in ${filePath}`
        ).toBe(false);
      }
    }
  });

  it('validates ChartAnnotationSchema logical (timestamp, price) coordinates and rejects invalid anchors', () => {
    const validSticker = ChartAnnotationSchema.parse({
      id: 'ann-1',
      ticker: 'aapl',
      type: 'sticker',
      anchors: [{ timestamp: 1729728000, price: 228.5 }],
      payload: { markdown: 'Breakout retest', color: 'emerald' },
      createdAt: 1729728000,
      updatedAt: 1729728000,
    });

    expect(validSticker.ticker).toBe('AAPL');
    expect(validSticker.anchors[0]).toEqual({
      timestamp: 1729728000,
      price: 228.5,
    });

    // Reject empty anchors or negative prices
    expect(() =>
      ChartAnnotationSchema.parse({
        id: 'ann-invalid',
        ticker: 'AAPL',
        type: 'trendline',
        anchors: [],
        payload: {},
        createdAt: 1729728000,
        updatedAt: 1729728000,
      })
    ).toThrow();
  });
});
