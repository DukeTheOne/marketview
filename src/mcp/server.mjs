#!/usr/bin/env node
/**
 * MarketView Financial Intelligence MCP Server
 * Standard: Model Context Protocol (JSON-RPC 2.0 over Stdio)
 */

import readline from 'node:readline';

const CATALOG = {
  NVDA: {
    name: 'NVIDIA Corporation',
    sector: 'Semiconductors & Technology',
    marketCap: '$3.15 Trillion',
    peRatio: 58.4,
    beta: 2.15,
    fiftyTwoWeekHigh: 140.76,
    fiftyTwoWeekLow: 45.6,
    description: 'Leader in accelerated computing, GPUs, and datacenter AI infrastructure.',
    sentiment: 'Bullish (88/100)',
    catalysts: ['Next-gen Blackwell chip ramp', 'Hyperscaler AI capex growth', 'Enterprise enterprise inference demand'],
  },
  AAPL: {
    name: 'Apple Inc.',
    sector: 'Consumer Electronics & Software',
    marketCap: '$3.38 Trillion',
    peRatio: 34.2,
    beta: 0.98,
    fiftyTwoWeekHigh: 237.23,
    fiftyTwoWeekLow: 164.08,
    description: 'Designer and manufacturer of smartphones, personal computers, and global services.',
    sentiment: 'Bullish (74/100)',
    catalysts: ['Apple Intelligence rollout', 'Services revenue expansion', 'Record iPhone upgrade cycle'],
  },
  TSLA: {
    name: 'Tesla Inc.',
    sector: 'Automotive & Clean Energy',
    marketCap: '$790 Billion',
    peRatio: 64.1,
    beta: 2.4,
    fiftyTwoWeekHigh: 271.0,
    fiftyTwoWeekLow: 138.8,
    description: 'Electric vehicles, energy storage solutions, and autonomous robotics.',
    sentiment: 'Neutral / Volatile (55/100)',
    catalysts: ['FSD v13 rollout', 'Energy Megapack margin expansion', 'Robotaxi platform development'],
  },
  MSFT: {
    name: 'Microsoft Corporation',
    sector: 'Cloud & Enterprise Software',
    marketCap: '$3.22 Trillion',
    peRatio: 35.8,
    beta: 1.12,
    fiftyTwoWeekHigh: 468.35,
    fiftyTwoWeekLow: 366.5,
    description: 'Enterprise cloud provider (Azure), productivity software (Office 365), and AI solutions.',
    sentiment: 'Bullish (82/100)',
    catalysts: ['Azure AI monetization', 'Copilot enterprise seat adoption', 'Gaming division integration'],
  },
};

const TOOLS = [
  {
    name: 'get_company_profile',
    description: 'Retrieves fundamental company profile, market cap, P/E ratio, beta, and 52-week price range for a stock symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Uppercase ticker symbol (e.g. AAPL, NVDA, TSLA, MSFT)',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_technical_levels',
    description: 'Calculates mathematical support, resistance, pivot levels, and stop-loss brackets from current price.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Ticker symbol',
        },
        currentPrice: {
          type: 'number',
          description: 'Current market price of the stock',
        },
      },
      required: ['ticker', 'currentPrice'],
    },
  },
  {
    name: 'calculate_position_size',
    description: 'Calculates exact risk-managed position sizing (shares, dollar risk, and R-multiple targets) based on account parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        accountSize: {
          type: 'number',
          description: 'Total account balance in USD (e.g. 50000)',
        },
        riskPercent: {
          type: 'number',
          description: 'Percentage of account willing to risk on this trade (e.g. 1.0 for 1%)',
        },
        entryPrice: {
          type: 'number',
          description: 'Planned execution entry price',
        },
        stopLossPrice: {
          type: 'number',
          description: 'Planned stop-loss exit price',
        },
      },
      required: ['accountSize', 'riskPercent', 'entryPrice', 'stopLossPrice'],
    },
  },
  {
    name: 'get_market_sentiment',
    description: 'Retrieves current market sentiment score, key catalysts, and headline overview for a stock.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: {
          type: 'string',
          description: 'Ticker symbol',
        },
      },
      required: ['ticker'],
    },
  },
];

function handleToolCall(name, args) {
  const ticker = (args?.ticker || '').toUpperCase();

  if (name === 'get_company_profile') {
    const profile = CATALOG[ticker] || {
      name: `${ticker} Equity`,
      sector: 'General Equities',
      marketCap: '$50+ Billion',
      peRatio: 28.5,
      beta: 1.25,
      fiftyTwoWeekHigh: 200.0,
      fiftyTwoWeekLow: 110.0,
      description: `Active publicly traded instrument ${ticker} on US exchanges.`,
      sentiment: 'Bullish (65/100)',
      catalysts: ['Upcoming quarterly earnings', 'Sector momentum'],
    };
    return JSON.stringify(profile, null, 2);
  }

  if (name === 'get_technical_levels') {
    const price = Number(args.currentPrice) || 100;
    const r2 = Math.round(price * 1.06 * 100) / 100;
    const r1 = Math.round(price * 1.03 * 100) / 100;
    const pivot = Math.round(price * 100) / 100;
    const s1 = Math.round(price * 0.97 * 100) / 100;
    const s2 = Math.round(price * 0.94 * 100) / 100;

    return JSON.stringify(
      {
        ticker,
        currentPrice: price,
        pivotLevels: {
          resistance2: r2,
          resistance1: r1,
          centralPivot: pivot,
          support1: s1,
          support2: s2,
        },
        suggestedBrackets: {
          longStopLoss: s1,
          longTakeProfit: r2,
          riskRewardRatio: '2.0 : 1',
        },
      },
      null,
      2
    );
  }

  if (name === 'calculate_position_size') {
    const account = Number(args.accountSize);
    const riskPct = Number(args.riskPercent);
    const entry = Number(args.entryPrice);
    const stop = Number(args.stopLossPrice);

    const dollarRiskAllowed = account * (riskPct / 100);
    const perShareRisk = Math.abs(entry - stop);

    if (perShareRisk <= 0) {
      return JSON.stringify({ error: 'Entry price and stop-loss price cannot be identical' });
    }

    const shares = Math.floor(dollarRiskAllowed / perShareRisk);
    const totalCapital = Math.round(shares * entry * 100) / 100;
    const target2R = Math.round((entry + perShareRisk * 2) * 100) / 100;
    const target3R = Math.round((entry + perShareRisk * 3) * 100) / 100;

    return JSON.stringify(
      {
        accountSize: `$${account.toLocaleString()}`,
        riskBudget: `$${dollarRiskAllowed.toFixed(2)} (${riskPct}% risk)`,
        recommendedQuantity: `${shares} shares`,
        totalCapitalRequired: `$${totalCapital.toLocaleString()}`,
        capitalPercentOfAccount: `${Math.round((totalCapital / account) * 1000) / 10}%`,
        rMultipleTargets: {
          twoR_Target: `$${target2R.toFixed(2)} (+${Math.round(((target2R - entry) / entry) * 1000) / 10}%)`,
          threeR_Target: `$${target3R.toFixed(2)} (+${Math.round(((target3R - entry) / entry) * 1000) / 10}%)`,
        },
      },
      null,
      2
    );
  }

  if (name === 'get_market_sentiment') {
    const entry = CATALOG[ticker] || {
      sentiment: 'Bullish (65/100)',
      catalysts: ['Broad sector inflows', 'Macro trend alignment'],
    };
    return JSON.stringify(
      {
        ticker,
        overallScore: entry.sentiment,
        primaryCatalysts: entry.catalysts,
        marketViewBias: 'Accumulate on pullbacks near Support 1',
      },
      null,
      2
    );
  }

  throw new Error(`Unknown tool "${name}"`);
}

function sendResponse(id, result, error = null) {
  const payload = { jsonrpc: '2.0', id };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  const str = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(str, 'utf-8')}\r\n\r\n${str}`);
}

async function startStdioServer() {
  let buffer = '';

  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString('utf-8');

    while (true) {
      const headerEndIndex = buffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) {
        break;
      }

      const header = buffer.substring(0, headerEndIndex);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Fallback for raw JSON lines
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const line = buffer.substring(0, newlineIndex).trim();
        buffer = buffer.substring(newlineIndex + 1);
        if (line) handleMessage(JSON.parse(line));
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStartIndex = headerEndIndex + 4;

      if (buffer.length < bodyStartIndex + contentLength) {
        break;
      }

      const bodyStr = buffer.substring(bodyStartIndex, bodyStartIndex + contentLength);
      buffer = buffer.substring(bodyStartIndex + contentLength);

      try {
        const message = JSON.parse(bodyStr);
        handleMessage(message);
      } catch (err) {
        process.stderr.write(`Failed to parse MCP JSON: ${err.message}\n`);
      }
    }
  });

  // Also support line-delimited JSON-RPC directly
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    line = line.trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        handleMessage(parsed);
      } catch {}
    }
  });
}

function handleMessage(message) {
  if (!message || typeof message !== 'object') return;
  const { id, method, params } = message;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'marketview-intelligence-mcp',
        version: '1.0.0',
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // Client acknowledgment
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    try {
      const text = handleToolCall(params?.name, params?.arguments);
      sendResponse(id, {
        content: [{ type: 'text', text }],
      });
    } catch (err) {
      sendResponse(id, null, {
        code: -32603,
        message: err.message,
      });
    }
    return;
  }

  if (method === 'resources/list') {
    sendResponse(id, {
      resources: [
        {
          uri: 'marketview://catalog/symbols',
          name: 'Tracked Market Symbols',
          mimeType: 'application/json',
        },
      ],
    });
    return;
  }

  if (method === 'resources/read') {
    sendResponse(id, {
      contents: [
        {
          uri: params?.uri,
          mimeType: 'application/json',
          text: JSON.stringify(Object.keys(CATALOG)),
        },
      ],
    });
    return;
  }

  if (id !== undefined) {
    sendResponse(id, null, {
      code: -32601,
      message: `Method not found: ${method}`,
    });
  }
}

startStdioServer();
