import { WebSocketServer } from 'ws';
import { config } from './config.js';

let wss = null;

export function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Auth check for WebSocket
    if (config.authSecret) {
      const url = new URL(req.url, `http://localhost`);
      const token = url.searchParams.get('token');
      if (token !== config.authSecret) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Heartbeat every 30s
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
}

// Broadcast event to all connected clients
export function broadcast(event, data) {
  if (!wss) return;
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}
