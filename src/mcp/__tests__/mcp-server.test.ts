import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverScript = resolve(__dirname, '../server.mjs');

function sendJsonRpc(proc: any, msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const raw = JSON.stringify(msg);
    const packet = `Content-Length: ${Buffer.byteLength(raw, 'utf-8')}\r\n\r\n${raw}`;

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');
      const headerEnd = str.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const body = str.substring(headerEnd + 4);
        try {
          const parsed = JSON.parse(body);
          proc.stdout.off('data', onData);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      }
    };

    proc.stdout.on('data', onData);
    proc.stdin.write(packet);
  });
}

describe('MarketView Financial Intelligence MCP Server (Stdio Transport)', () => {
  it('implements standard MCP initialize and lists 4 financial intelligence tools', async () => {
    const nodeBin = process.execPath;
    const proc = spawn(nodeBin, [serverScript], { stdio: ['pipe', 'pipe', 'pipe'] });

    try {
      // 1. Initialize
      const initResp = await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'antigravity-test-client', version: '2.0' },
        },
      });

      expect(initResp.result.serverInfo.name).toBe('marketview-intelligence-mcp');
      expect(initResp.result.protocolVersion).toBe('2024-11-05');

      // 2. Tools List
      const toolsResp = await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

      const toolNames = toolsResp.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_company_profile');
      expect(toolNames).toContain('get_technical_levels');
      expect(toolNames).toContain('calculate_position_size');
      expect(toolNames).toContain('get_market_sentiment');

      // 3. Tool Call: Position Sizing calculation
      const calcResp = await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'calculate_position_size',
          arguments: {
            accountSize: 100000,
            riskPercent: 1.0,
            entryPrice: 130.0,
            stopLossPrice: 125.0,
          },
        },
      });

      const parsedCalc = JSON.parse(calcResp.result.content[0].text);
      expect(parsedCalc.riskBudget).toBe('$1000.00 (1% risk)');
      expect(parsedCalc.recommendedQuantity).toBe('200 shares');

      // 4. Tool Call: Company Profile
      const profResp = await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_company_profile',
          arguments: { ticker: 'NVDA' },
        },
      });

      const parsedProf = JSON.parse(profResp.result.content[0].text);
      expect(parsedProf.name).toBe('NVIDIA Corporation');
      expect(parsedProf.peRatio).toBe(58.4);
    } finally {
      proc.kill();
    }
  });
});
