const statusEl = document.getElementById("status");
const btnSettings = document.getElementById("btnSettings");
const btnConnect = document.getElementById("btnConnect");
const mainEl = document.getElementById("main");
const settingsPanel = document.getElementById("settingsPanel");
const sessionListEl = document.getElementById("sessionList");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const settingUrl = document.getElementById("settingUrl");
const settingApiKey = document.getElementById("settingApiKey");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnScan = document.getElementById("btnScan");
const scanResults = document.getElementById("scanResults");
const canvasGoalEl = document.getElementById("canvasGoal");
const canvasStepsEl = document.getElementById("canvasSteps");
const btnRefreshCanvas = document.getElementById("btnRefreshCanvas");
const proposalsListEl = document.getElementById("proposalsList");
const btnProactive = document.getElementById("btnProactive");
const heartbeatResultEl = document.getElementById("heartbeatResult");
const btnHeartbeat = document.getElementById("btnHeartbeat");
const connectErrorEl = document.getElementById("connectError");
const toolsListEl = document.getElementById("toolsList");
const btnToolsList = document.getElementById("btnToolsList");
const sessionTypeSelect = document.getElementById("sessionTypeSelect");
const teamWrap = document.getElementById("teamWrap");
const teamSelect = document.getElementById("teamSelect");
const consultHint = document.getElementById("consultHint");
const connectionWrap = document.getElementById("connectionWrap");
const connectionSelect = document.getElementById("connectionSelect");
const settingConnectionSelect = document.getElementById("settingConnectionSelect");
const btnAddConnection = document.getElementById("btnAddConnection");
const btnDeleteConnection = document.getElementById("btnDeleteConnection");
const canvasGoalEdit = document.getElementById("canvasGoalEdit");
const canvasStepsEdit = document.getElementById("canvasStepsEdit");
const btnSaveCanvas = document.getElementById("btnSaveCanvas");

let ws = null;
let config = { connections: [{ id: "default", name: "默认", gatewayUrl: "ws://127.0.0.1:18789", apiKey: "" }], activeConnectionId: "default" };
let pending = new Map();
let currentSessionId = "main";
let currentSessionType = "general";
let currentTeamId = "";
let sessions = [];
let swarmTeams = [];
let canvasData = null;

function setStatus(text, className = "") {
  statusEl.textContent = text;
  statusEl.className = className;
}

function migrateConfig(raw) {
  if (raw.connections && Array.isArray(raw.connections) && raw.connections.length > 0) {
    return { connections: raw.connections, activeConnectionId: raw.activeConnectionId || raw.connections[0].id };
  }
  return {
    connections: [{ id: "default", name: "默认", gatewayUrl: raw.gatewayUrl || "ws://127.0.0.1:18789", apiKey: raw.apiKey || "" }],
    activeConnectionId: "default",
  };
}

function getActiveConnection() {
  const c = config.connections.find((x) => x.id === config.activeConnectionId);
  return c || config.connections[0] || { gatewayUrl: "ws://127.0.0.1:18789", apiKey: "" };
}

async function loadConfig() {
  if (window.electronAPI) {
    const raw = await window.electronAPI.configRead();
    config = migrateConfig(raw);
  } else {
    config = { connections: [{ id: "default", name: "默认", gatewayUrl: "ws://127.0.0.1:18789", apiKey: "" }], activeConnectionId: "default" };
  }
  fillConnectionDropdowns();
  const active = getActiveConnection();
  settingUrl.value = active.gatewayUrl || "";
  settingApiKey.value = active.apiKey || "";
}

function invoke(method, params = {}) {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = { id, method, params };
  const apiKey = getActiveConnection().apiKey;
  if (apiKey) payload.params = { ...payload.params, apiKey };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    else reject(new Error("WebSocket not open"));
  });
}

function showConnectError(msg) {
  if (!connectErrorEl) return;
  connectErrorEl.innerHTML = "";
  connectErrorEl.appendChild(document.createTextNode(msg));
  const btn = document.createElement("button");
  btn.textContent = " 重试";
  btn.style.marginLeft = "8px";
  btn.onclick = () => { clearConnectError(); connect(); };
  connectErrorEl.appendChild(btn);
  connectErrorEl.classList.remove("hidden");
}
function clearConnectError() {
  if (connectErrorEl) { connectErrorEl.classList.add("hidden"); connectErrorEl.innerHTML = ""; }
}

function connect() {
  if (ws) { ws.close(); ws = null; }
  clearConnectError();
  const active = getActiveConnection();
  const url = (active.gatewayUrl || "").trim() || "ws://127.0.0.1:18789";
  setStatus("连接中…");
  ws = new WebSocket(url);
  ws.onopen = async () => {
    if (connectErrorEl) connectErrorEl.classList.add("hidden");
    setStatus("已连接", "connected");
    mainEl.classList.remove("hidden");
    settingsPanel.classList.add("hidden");
    if (connectionWrap) connectionWrap.classList.remove("hidden");
    fillConnectionDropdowns();
    if (connectionSelect) connectionSelect.value = config.activeConnectionId || "";
    try {
      const health = await invoke("health");
      if (health && health.ok) setStatus("已连接 ✓", "connected");
      else setStatus("已连接（健康检查异常）", "connected");
    } catch (_) {
      setStatus("已连接（健康检查失败）", "connected");
    }
    loadSessions();
    loadSwarmTeams();
    loadCurrentSessionMessages();
    loadCanvas();
    loadToolsList();
  };
  ws.onclose = () => {
    setStatus("已断开", "error");
    ws = null;
    if (connectionWrap) connectionWrap.classList.add("hidden");
    showConnectError("连接已断开，请检查 Gateway 是否运行或点击「连接」重试。");
  };
  ws.onerror = () => {
    setStatus("连接错误", "error");
    showConnectError("连接失败，请检查地址与网络后重试。");
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.stream === "text" && msg.chunk != null) {
        appendStreamChunk(msg.chunk);
        return;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) resolve({ error: msg.error.message });
        else resolve(msg.result);
      }
    } catch (_) {}
  };
}

function appendStreamChunk(chunk) {
  const last = messagesEl.querySelector(".msg.assistant.stream");
  if (last) last.textContent += chunk;
  else {
    const div = document.createElement("div");
    div.className = "msg assistant stream";
    div.textContent = chunk;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function finalizeStream(content) {
  const last = messagesEl.querySelector(".msg.assistant.stream");
  if (last) {
    last.classList.remove("stream");
    if (content) last.textContent = content;
  }
}

async function loadSwarmTeams() {
  try {
    const res = await invoke("swarm.getTeams");
    swarmTeams = res?.teams || [];
    const defaultId = res?.defaultTeamId;
    teamSelect.innerHTML = '<option value="">（无）</option>';
    swarmTeams.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name || t.id;
      if (t.id === defaultId) opt.selected = true;
      teamSelect.appendChild(opt);
    });
    if (currentSessionType === "swarm_manager") {
      teamWrap.classList.remove("hidden");
      currentTeamId = teamSelect.value || "";
    } else {
      teamWrap.classList.add("hidden");
    }
  } catch (_) {
    swarmTeams = [];
  }
}

async function loadSessions() {
  try {
    const res = await invoke("session.list", { limit: 50 });
    sessions = res?.sessions || [];
    sessionListEl.innerHTML = "";
    const typeLabel = (st) => ({ dev: "开发", knowledge: "知识库", pm: "PM", swarm_manager: "蜂群", general: "通用" }[st] || st || "通用");
    const add = (id, label, sessionType) => {
      const b = document.createElement("button");
      b.textContent = (label || id) + " [" + typeLabel(sessionType) + "]";
      b.style.display = "block";
      b.style.width = "100%";
      b.style.textAlign = "left";
      b.style.padding = "6px";
      b.onclick = () => selectSession(id);
      sessionListEl.appendChild(b);
    };
    add("main", "当前会话 (main)", currentSessionType);
    sessions.forEach((s) => {
      if (s.sessionId !== "main") add(s.sessionId, s.sessionId, s.sessionType);
    });
  } catch (_) {}
}

function selectSession(sessionId) {
  currentSessionId = sessionId;
  const s = sessionId === "main" ? null : sessions.find((x) => x.sessionId === sessionId);
  if (s && s.sessionType) {
    currentSessionType = s.sessionType;
    if (sessionTypeSelect) sessionTypeSelect.value = currentSessionType;
    if (currentSessionType === "swarm_manager" && teamWrap) teamWrap.classList.remove("hidden");
    else if (teamWrap) teamWrap.classList.add("hidden");
  }
  loadCurrentSessionMessages();
}

async function loadCurrentSessionMessages() {
  try {
    await invoke("session.restore", { sessionId: currentSessionId });
    const info = await invoke("session.getOrCreate", { sessionId: currentSessionId, sessionType: currentSessionType });
    if (info.sessionType) currentSessionType = info.sessionType;
    if (sessionTypeSelect) sessionTypeSelect.value = currentSessionType;
    updateSessionTypeUI();
    messagesEl.innerHTML = "";
    if (info.messagesCount > 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "msg assistant";
      placeholder.textContent = `(已恢复会话，共 ${info.messagesCount || 0} 条消息；历史消息需从快照加载)`;
      messagesEl.appendChild(placeholder);
    }
  } catch (_) {
    messagesEl.innerHTML = "";
  }
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  inputEl.value = "";
  sendBtn.disabled = true;

  const userDiv = document.createElement("div");
  userDiv.className = "msg user";
  userDiv.textContent = text;
  messagesEl.appendChild(userDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const params = { message: text, sessionId: currentSessionId, sessionType: currentSessionType };
  if (currentSessionType === "swarm_manager" && teamSelect && teamSelect.value) params.teamId = teamSelect.value;
  if (config.apiKey) params.apiKey = config.apiKey;
  ws.send(JSON.stringify({ id: reqId, method: "chat", params }));

  const onResult = (result) => {
    finalizeStream(result?.content);
    sendBtn.disabled = false;
    loadSessions();
  };
  const check = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.stream === "text" && msg.chunk != null) appendStreamChunk(msg.chunk);
      else if (msg.id === reqId) {
        ws.removeEventListener("message", check);
        if (msg.error) finalizeStream("错误: " + msg.error.message);
        else onResult(msg.result);
      }
    } catch (_) {}
  };
  ws.addEventListener("message", check);
  loadCanvas();
}

async function loadCanvas() {
  try {
    const res = await invoke("canvas.get", {});
    canvasData = res?.canvas || null;
    if (canvasGoalEl) canvasGoalEl.textContent = canvasData?.goal ? "目标: " + canvasData.goal : "(无)";
    if (canvasStepsEl) {
      const steps = canvasData?.steps || [];
      canvasStepsEl.textContent = steps.length
        ? steps.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n")
        : "(无步骤)";
    }
    if (canvasGoalEdit) canvasGoalEdit.value = canvasData?.goal || "";
    if (canvasStepsEdit) {
      const steps = canvasData?.steps || [];
      canvasStepsEdit.value = steps.length
        ? steps.map((s) => s.title + (s.status && s.status !== "pending" ? " [" + s.status + "]" : "")).join("\n")
        : "";
    }
  } catch (_) {
    if (canvasGoalEl) canvasGoalEl.textContent = "(获取失败)";
    if (canvasStepsEl) canvasStepsEl.textContent = "";
    if (canvasGoalEdit) canvasGoalEdit.value = "";
    if (canvasStepsEdit) canvasStepsEdit.value = "";
  }
}

if (btnRefreshCanvas) btnRefreshCanvas.addEventListener("click", loadCanvas);

function fillConnectionDropdowns() {
  const list = config.connections || [];
  const setSelect = (el, value) => {
    if (!el) return;
    el.innerHTML = "";
    list.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name || c.id;
      if (c.id === (value || config.activeConnectionId)) opt.selected = true;
      el.appendChild(opt);
    });
  };
  setSelect(connectionSelect, config.activeConnectionId);
  setSelect(settingConnectionSelect, config.activeConnectionId);
}

function selectConnectionInSettings(id) {
  config.activeConnectionId = id;
  const c = config.connections.find((x) => x.id === id);
  if (c) {
    settingUrl.value = c.gatewayUrl || "";
    settingApiKey.value = c.apiKey || "";
  }
  fillConnectionDropdowns();
}

if (settingConnectionSelect) {
  settingConnectionSelect.addEventListener("change", () => {
    selectConnectionInSettings(settingConnectionSelect.value);
  });
}
if (btnAddConnection) {
  btnAddConnection.addEventListener("click", () => {
    const id = "conn-" + Date.now();
    config.connections.push({ id, name: "新连接", gatewayUrl: "", apiKey: "" });
    config.activeConnectionId = id;
    fillConnectionDropdowns();
    settingUrl.value = "";
    settingApiKey.value = "";
    if (settingConnectionSelect) settingConnectionSelect.value = id;
  });
}
if (btnDeleteConnection) {
  btnDeleteConnection.addEventListener("click", () => {
    if (config.connections.length <= 1) return;
    const idx = config.connections.findIndex((c) => c.id === config.activeConnectionId);
    config.connections.splice(idx, 1);
    config.activeConnectionId = config.connections[0].id;
    const active = getActiveConnection();
    settingUrl.value = active.gatewayUrl || "";
    settingApiKey.value = active.apiKey || "";
    fillConnectionDropdowns();
    if (settingConnectionSelect) settingConnectionSelect.value = config.activeConnectionId;
  });
}

if (connectionSelect) {
  connectionSelect.addEventListener("change", () => {
    const id = connectionSelect.value;
    if (id && id !== config.activeConnectionId) {
      config.activeConnectionId = id;
      if (window.electronAPI) window.electronAPI.configWrite(config);
      if (ws) { ws.close(); ws = null; }
      connect();
    }
  });
}

async function saveCanvasFromEdit() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const goal = canvasGoalEdit ? canvasGoalEdit.value.trim() : "";
  const rawSteps = canvasStepsEdit ? canvasStepsEdit.value.trim().split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const steps = rawSteps.map((line, i) => {
    const done = /\[done\]$/i.test(line);
    const inProgress = /\[in_progress\]$/i.test(line) || /\[进行中\]$/i.test(line);
    const title = line.replace(/\s*\[(done|in_progress|pending|进行中)\]$/i, "").trim();
    return { index: i, title: title || "步骤 " + (i + 1), status: done ? "done" : inProgress ? "in_progress" : "pending" };
  });
  try {
    await invoke("canvas.update", { goal: goal || undefined, steps });
    await loadCanvas();
  } catch (e) {
    if (canvasStepsEl) canvasStepsEl.textContent = "保存失败: " + (e.message || e);
  }
}
if (btnSaveCanvas) btnSaveCanvas.addEventListener("click", saveCanvasFromEdit);

function updateSessionTypeUI() {
  if (currentSessionType === "swarm_manager" && teamWrap) teamWrap.classList.remove("hidden");
  else if (teamWrap) teamWrap.classList.add("hidden");
  if (consultHint) {
    if (currentSessionType === "knowledge") consultHint.classList.remove("hidden");
    else consultHint.classList.add("hidden");
  }
}
if (sessionTypeSelect) {
  sessionTypeSelect.addEventListener("change", async () => {
    currentSessionType = sessionTypeSelect.value;
    updateSessionTypeUI();
    try {
      await invoke("session.getOrCreate", { sessionId: currentSessionId, sessionType: currentSessionType });
      loadSessions();
    } catch (_) {}
  });
}
if (teamSelect) {
  teamSelect.addEventListener("change", () => {
    currentTeamId = teamSelect.value || "";
  });
}

async function loadToolsList() {
  try {
    const res = await invoke("tools.list", {});
    const tools = res?.tools || [];
    toolsListEl.textContent = tools.map((t) => t.name).join(", ") || "(无)";
  } catch (_) {
    toolsListEl.textContent = "(获取失败)";
  }
}
if (btnToolsList) btnToolsList.addEventListener("click", loadToolsList);

btnProactive.addEventListener("click", async () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  proposalsListEl.textContent = "加载中…";
  try {
    const res = await invoke("proactive.suggest", { trigger: "explicit" });
    const lines = [...(res.proposals || []), ...(res.suggestions || [])];
    proposalsListEl.textContent = lines.length ? lines.join("\n\n") : "(无提议)";
  } catch (e) {
    proposalsListEl.textContent = "错误: " + (e.message || e);
  }
});

btnHeartbeat.addEventListener("click", async () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  heartbeatResultEl.textContent = "执行中…";
  try {
    const res = await invoke("heartbeat.tick", {});
    if (res.error) heartbeatResultEl.textContent = "错误: " + res.error;
    else if (res.executed && res.content) heartbeatResultEl.textContent = res.content.slice(0, 300);
    else heartbeatResultEl.textContent = res.executed ? "已执行" : "无需执行";
  } catch (e) {
    heartbeatResultEl.textContent = "错误: " + (e.message || e);
  }
});

btnSettings.addEventListener("click", () => {
  settingsPanel.classList.remove("hidden");
  mainEl.classList.add("hidden");
  loadConfig().then(() => {
    const active = getActiveConnection();
    settingUrl.value = active.gatewayUrl || "";
    settingApiKey.value = active.apiKey || "";
    fillConnectionDropdowns();
    if (settingConnectionSelect) settingConnectionSelect.value = config.activeConnectionId || "";
  });
});

btnConnect.addEventListener("click", () => {
  loadConfig().then(() => {
    const active = getActiveConnection();
    active.gatewayUrl = settingUrl.value.trim();
    active.apiKey = settingApiKey.value.trim();
    if (window.electronAPI) window.electronAPI.configWrite(config);
    connect();
  });
});

function validateGatewayUrl(url) {
  const u = (url || "").trim();
  return u.startsWith("ws://") || u.startsWith("wss://");
}

if (btnScan && scanResults) {
  btnScan.addEventListener("click", async () => {
    scanResults.textContent = "扫描中（约 5 秒）…";
    const list = window.electronAPI ? await window.electronAPI.discoveryScan() : [];
    if (list.length === 0) scanResults.textContent = "未发现 Gateway。请确认对方已启用 gateway.discovery。";
    else {
      scanResults.innerHTML = list.map((s) => `<div><a href="#" data-url="${s.url}">${s.name} — ${s.url}</a></div>`).join("");
      scanResults.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", (e) => { e.preventDefault(); settingUrl.value = a.dataset.url; });
      });
    }
  });
}

btnSaveSettings.addEventListener("click", () => {
  const url = settingUrl.value.trim();
  if (!validateGatewayUrl(url)) {
    alert("Gateway 地址须以 ws:// 或 wss:// 开头");
    return;
  }
  const id = settingConnectionSelect ? settingConnectionSelect.value : config.activeConnectionId;
  const conn = config.connections.find((c) => c.id === id);
  if (conn) {
    conn.gatewayUrl = url;
    conn.apiKey = settingApiKey.value.trim();
    conn.name = conn.name || conn.id;
  }
  config.activeConnectionId = id || config.activeConnectionId;
  if (window.electronAPI) window.electronAPI.configWrite(config);
  connect();
});

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

(async () => {
  await loadConfig();
  if (config.gatewayUrl) {
    connect();
  } else {
    settingsPanel.classList.remove("hidden");
    mainEl.classList.add("hidden");
  }
})();
