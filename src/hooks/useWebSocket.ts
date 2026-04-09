import { useEffect, useRef, useCallback } from 'react';

interface WSEvent {
  event: string;
  data: any;
  timestamp: string;
}

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws';

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const event: WSEvent = JSON.parse(msg.data);
        onEvent(event);
      } catch {}
    };

    ws.onclose = () => {
      // Auto-reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [onEvent]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
