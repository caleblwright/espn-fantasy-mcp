import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApp } from '../src/http.js';

test('HTTP refuses missing/incorrect authentication and browser origins before MCP runs', () => {
  assert.throws(() => createHttpApp('short'));
  const token = 'test-only-'.repeat(5);
  const app = createHttpApp(token);
  for (const [headers, expected] of [
    [{}, 401], [{ authorization: 'Bearer wrong' }, 401],
    [{ authorization: `Bearer ${token}`, origin: 'https://untrusted.example' }, 403],
  ] as const) {
    let status = 0; let ended = false;
    app.emit('request', { headers, url: '/mcp', method: 'POST' }, {
      writeHead(code: number) { status = code; }, end() { ended = true; },
    });
    assert.equal(status, expected); assert.equal(ended, true);
  }
  app.close();
});
