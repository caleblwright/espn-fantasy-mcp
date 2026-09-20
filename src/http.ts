import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './index.js';

/** Single-owner, stateless MCP endpoint. TLS must be provided by the host/proxy. */
export function createHttpApp(token: string) {
  if (token.length < 32) throw new Error('MCP_AUTH_TOKEN must contain at least 32 characters.');
  const expected = Buffer.from(`Bearer ${token}`);
  return createHttpServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }); res.end(); return;
    }
    // This endpoint is for authenticated MCP clients, not cross-origin browser scripts.
    if (req.headers.origin) { res.writeHead(403); res.end(); return; }
    if (req.url !== '/mcp') { res.writeHead(404); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    const server = createServer(true); // Remote transport never exposes write tools.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    const app = createHttpApp(process.env.MCP_AUTH_TOKEN ?? '');
    app.listen(port, process.env.HOST ?? '127.0.0.1', () => console.error('Read-only ESPN HTTP MCP ready'));
    app.on('error', () => { console.error('Unable to listen for MCP requests.'); process.exitCode = 1; });
  } catch {
    console.error('Unable to start HTTP MCP. Check MCP_AUTH_TOKEN, HOST and PORT.'); process.exitCode = 1;
  }
}
