/**
 * Phase 15 加强：中/英/日多语（CN / EN / JP）
 */
(function () {
  var STORAGE_KEY = 'officeUiLang';
  var LANG = {
    zh: {
      title: 'Rzeclaw 办公室',
      statusConnecting: '正在连接…',
      statusConnected: '已连接',
      statusDisconnected: '未连接 Gateway (ws://127.0.0.1:18789)',
      statusError: '连接错误',
      memoTitle: '昨日小记',
      memoNone: '暂无',
      btnBlueprints: '智能体图鉴',
      btnSend: '发送',
      chatPlaceholder: '输入消息…',
      toastJoined: '入职',
      toastLeft: '已下班',
      errorPrefix: '错误: ',
      noBlueprint: '暂无蓝图',
      notConnected: '未连接',
      requestFailed: '请求失败',
      langZh: '中文',
      langEn: 'EN',
      langJa: '日本語',
      mainStatusLabel: '主状态: ',
    },
    en: {
      title: 'Rzeclaw Office',
      statusConnecting: 'Connecting…',
      statusConnected: 'Connected',
      statusDisconnected: 'Not connected (ws://127.0.0.1:18789)',
      statusError: 'Connection error',
      memoTitle: "Yesterday's Memo",
      memoNone: 'None',
      btnBlueprints: 'Agent Blueprints',
      btnSend: 'Send',
      chatPlaceholder: 'Type a message…',
      toastJoined: 'joined',
      toastLeft: 'left',
      errorPrefix: 'Error: ',
      noBlueprint: 'No blueprints',
      notConnected: 'Not connected',
      requestFailed: 'Request failed',
      langZh: '中文',
      langEn: 'EN',
      langJa: '日本語',
      mainStatusLabel: 'State: ',
    },
    ja: {
      title: 'Rzeclaw オフィス',
      statusConnecting: '接続中…',
      statusConnected: '接続済み',
      statusDisconnected: '未接続 (ws://127.0.0.1:18789)',
      statusError: '接続エラー',
      memoTitle: '昨日のメモ',
      memoNone: 'なし',
      btnBlueprints: 'エージェント図鑑',
      btnSend: '送信',
      chatPlaceholder: 'メッセージを入力…',
      toastJoined: '入室',
      toastLeft: '退室',
      errorPrefix: 'エラー: ',
      noBlueprint: 'ブループリントなし',
      notConnected: '未接続',
      requestFailed: 'リクエスト失敗',
      langZh: '中文',
      langEn: 'EN',
      langJa: '日本語',
      mainStatusLabel: '状態: ',
    },
  };

  function getLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && LANG[stored]) return stored;
    } catch (e) {}
    return 'zh';
  }

  function setLang(lang) {
    if (!LANG[lang]) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyLang();
  }

  function t(key) {
    var lang = getLang();
    var map = LANG[lang] || LANG.zh;
    return map[key] != null ? map[key] : (LANG.zh[key] || key);
  }

  function applyLang() {
    var lang = getLang();
    var map = LANG[lang] || LANG.zh;
    try { document.documentElement.lang = (lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en'); } catch (e) {}
    document.title = map.title;
    var memoTitle = document.getElementById('memo-title');
    if (memoTitle) memoTitle.textContent = map.memoTitle;
    var memoContent = document.getElementById('memo-content');
    var nonePlaceholders = [LANG.zh.memoNone, LANG.en.memoNone, LANG.ja.memoNone].filter(Boolean);
    if (memoContent && nonePlaceholders.indexOf(memoContent.textContent.trim()) !== -1) memoContent.textContent = map.memoNone;
    var btnBlueprints = document.getElementById('btn-blueprints');
    if (btnBlueprints) btnBlueprints.textContent = map.btnBlueprints;
    var btnSend = document.getElementById('chat-send');
    if (btnSend) btnSend.textContent = map.btnSend;
    var chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.placeholder = map.chatPlaceholder;
    var langZh = document.getElementById('lang-zh');
    if (langZh) langZh.textContent = map.langZh;
    var langEn = document.getElementById('lang-en');
    if (langEn) langEn.textContent = map.langEn;
    var langJa = document.getElementById('lang-ja');
    if (langJa) langJa.textContent = map.langJa;
    if (typeof window.onLangChange === 'function') window.onLangChange();
    if (window._lastStatusKey && window.updateStatusBar) window.updateStatusBar(window._lastStatusKey);
  }

  window.I18N = { getLang: getLang, setLang: setLang, t: t, applyLang: applyLang };
  window.t = t;
})();
