/* ═══════════════════════════════════════
   SSE MANAGER — reconnect, PageVisibility, onReconnect
   ═══════════════════════════════════════ */

let sseSource = null;
let sseActive = false;
let onDataCallback = null;
let onReconnectCallback = null;
let reconnectTimer = null;

export function connectSSE(onData, onReconnect) {
  onDataCallback = onData;
  onReconnectCallback = onReconnect || null;
  _doConnect();
  
  // Pause SSE when tab is hidden (mobile battery saving)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _disconnect();
    } else {
      _doConnect();
      // Full data refresh when coming back from hidden
      if (onReconnectCallback) onReconnectCallback();
    }
  });
}

function _doConnect() {
  if (sseSource) _disconnect();
  
  sseSource = new EventSource('/events');
  
  sseSource.onmessage = function(e) {
    try {
      if (onDataCallback) onDataCallback(JSON.parse(e.data));
    } catch {}
  };
  
  sseSource.onerror = function() {
    sseActive = false;
    _disconnect();
    // Exponential backoff reconnect: 1s, 3s, 7s, 15s...
    const delay = Math.min(15000, (reconnectTimer ? parseInt(reconnectTimer) * 2 + 1000 : 1000));
    reconnectTimer = setTimeout(_doConnect, delay);
  };
  
  sseSource.onopen = function() {
    sseActive = true;
    reconnectTimer = null;
  };
}

function _disconnect() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function isSSEActive() { return sseActive; }
