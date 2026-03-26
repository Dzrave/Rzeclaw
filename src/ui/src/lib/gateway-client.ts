/**
 * Gateway RPC Client — TypeScript WebSocket JSON-RPC 2.0 client
 * Connects to the RezBot Gateway server for all backend communication.
 */

type RpcCallback = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type StreamHandler = (chunk: unknown) => void;

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]; // ms
const DEFAULT_TIMEOUT = 30_000; // 30s
const HEARTBEAT_INTERVAL = 30_000; // 30s

class _GatewayClient {
  private ws: WebSocket | null = null;
  private url = '';
  private state: ConnectionState = 'disconnected';
  private rpcId = 0;
  private pending = new Map<number, RpcCallback>();
  private streamHandlers = new Map<number, StreamHandler>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stateListeners: Array<(state: ConnectionState) => void> = [];
  private latency = 0;
  private latencyListeners: Array<(ms: number) => void> = [];

  /** Initialize the client and connect */
  init(url?: string) {
    this.url = url ?? this.detectUrl();
    this.connect();
  }

  /** Detect WebSocket URL based on page location */
  private detectUrl(): string {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev mode (Vite proxy), connect to same host; in production, gateway serves the SPA
    return `${protocol}//${loc.hostname}:${loc.port || '18789'}`;
  }

  /** Establish WebSocket connection */
  private connect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startHeartbeat();
      console.log('[Gateway] Connected to', this.url);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        this.handleMessage(data);
      } catch (e) {
        console.error('[Gateway] Parse error:', e);
      }
    };

    ws.onerror = (ev) => {
      console.error('[Gateway] WebSocket error:', ev);
    };

    ws.onclose = () => {
      this.setState('disconnected');
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    this.ws = ws;
  }

  /** Handle incoming JSON-RPC messages */
  private handleMessage(data: Record<string, unknown>) {
    const id = data.id as number | undefined;

    // Stream chunk (custom extension: { id, stream: "...", ... })
    if (id !== undefined && data.stream !== undefined) {
      const handler = this.streamHandlers.get(id);
      if (handler) handler(data);
      return;
    }

    // Standard JSON-RPC response
    if (id !== undefined) {
      const cb = this.pending.get(id);
      if (!cb) return;

      clearTimeout(cb.timer);
      this.pending.delete(id);

      if (data.error) {
        const err = data.error as { message?: string; code?: number };
        cb.reject(new Error(err.message ?? 'RPC Error'));
      } else {
        cb.resolve(data.result);
      }
      return;
    }

    // Server-initiated notification (no id)
    if (data.method) {
      window.dispatchEvent(new CustomEvent('rpc-notification', { detail: data }));
    }
  }

  /** Send a JSON-RPC request */
  call<T = unknown>(method: string, params?: Record<string, unknown>, timeout = DEFAULT_TIMEOUT): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to gateway'));
        return;
      }

      const id = ++this.rpcId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeout);

      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer });

      const startTs = Date.now();
      const origResolve = resolve;
      const wrappedResolve = (result: T) => {
        this.updateLatency(Date.now() - startTs);
        origResolve(result);
      };
      this.pending.set(id, { resolve: wrappedResolve as (r: unknown) => void, reject, timer });

      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: params ?? {},
      }));
    });
  }

  /** Send a streaming RPC request */
  callStream(method: string, params: Record<string, unknown>, onChunk: StreamHandler, timeout = 120_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to gateway'));
        return;
      }

      const id = ++this.rpcId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.streamHandlers.delete(id);
        reject(new Error(`RPC stream timeout: ${method}`));
      }, timeout);

      this.streamHandlers.set(id, onChunk);
      this.pending.set(id, {
        resolve: (result: unknown) => {
          this.streamHandlers.delete(id);
          resolve(result);
        },
        reject: (err: Error) => {
          this.streamHandlers.delete(id);
          reject(err);
        },
        timer,
      });

      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: { ...params, stream: true },
      }));
    });
  }

  /** Connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Get last measured latency in ms */
  getLatency(): number {
    return this.latency;
  }

  onStateChange(fn: (state: ConnectionState) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      const idx = this.stateListeners.indexOf(fn);
      if (idx >= 0) this.stateListeners.splice(idx, 1);
    };
  }

  onLatencyChange(fn: (ms: number) => void): () => void {
    this.latencyListeners.push(fn);
    return () => {
      const idx = this.latencyListeners.indexOf(fn);
      if (idx >= 0) this.latencyListeners.splice(idx, 1);
    };
  }

  private setState(s: ConnectionState) {
    this.state = s;
    for (const fn of this.stateListeners) {
      try { fn(s); } catch { /* ignore */ }
    }
  }

  private updateLatency(ms: number) {
    this.latency = ms;
    for (const fn of this.latencyListeners) {
      try { fn(ms); } catch { /* ignore */ }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    console.log(`[Gateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.call('health').catch(() => { /* ignore */ });
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Force disconnect */
  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }
}

/** Singleton Gateway client */
export const GatewayClient = new _GatewayClient();
