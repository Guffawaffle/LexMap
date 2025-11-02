import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

let server: any;

export async function startServer(
  lexbrainUrl: string,
  mode: string,
  keyHex?: string,
): Promise<void> {
  server = createServer(handleRequest);

  server.listen(6902, () => {
    console.log('🌐 MCP server listening on http://localhost:6902');
  });
}async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    // Prometheus metrics
    res.setHeader('Content-Type', 'text/plain');
    res.writeHead(200);
    res.end('# Prometheus metrics placeholder\n');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/slice') {
    // Handle slice request
    const body = await readBody(req);
    const params = JSON.parse(body);

    // Would call slice logic here
    res.writeHead(200);
    res.end(JSON.stringify({ slice: 'placeholder' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/query') {
    // Handle query request
    const body = await readBody(req);
    const params = JSON.parse(body);

    // Would call query logic here
    res.writeHead(200);
    res.end(JSON.stringify({ result: 'placeholder' }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
