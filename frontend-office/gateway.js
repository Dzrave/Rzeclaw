/**
 * Phase 15 WO-OF-012: WebSocket 连接 Rzeclaw Gateway，JSON-RPC 封装
 */
(function () {
  const defaultWsUrl = (function () {
    const u = new URL(window.location.href);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + u.hostname + ':' + (u.searchParams.get('port') || '18789');
  })();

  let ws = null;
  let nextId = 1;
  const pending = new Map();
  let onStreamCallback = null;

  function connect(wsUrl) {
    const url = wsUrl || defaultWsUrl;
    ws = new WebSocket(url);
    ws.onopen = function () {
      if (window.updateStatusBar) window.updateStatusBar('statusConnected');
    };
    ws.onclose = function () {
      if (window.updateStatusBar) window.updateStatusBar('statusDisconnected');
    };
    ws.onerror = function () {
      if (window.updateStatusBar) window.updateStatusBar('statusError');
    };
    ws.onmessage = function (ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.stream === 'text' && msg.chunk !== undefined) {
          if (onStreamCallback && msg.id) onStreamCallback(msg.id, msg.chunk);
          return;
        }
        const id = msg.id;
        const resolve = id != null ? pending.get(id) : null;
        if (resolve) {
          pending.delete(id);
          if (msg.error) resolve({ error: msg.error });
          else resolve({ result: msg.result });
        }
      } catch (_) {}
    };
    return new Promise(function (resolve, reject) {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      ws.onopen = function () {
        if (window.updateStatusBar) window.updateStatusBar('statusConnected');
        resolve();
      };
      ws.onerror = function () { reject(new Error('WebSocket error')); };
    });
  }

  function request(method, params) {
    const id = String(nextId++);
    const promise = new Promise(function (resolve, reject) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ error: { message: 'timeout' } });
        }
      }, 60000);
    });
    promise.id = id;
    return promise;
  }

  function setOnStream(cb) {
    onStreamCallback = cb;
  }

  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  window.Gateway = {
    connect,
    request,
    setOnStream,
    isConnected,
    defaultWsUrl,
  };
})();
