/**
 * Phase 15 WO-OF-010/011/013 + WO-OF-030～034: Phaser 办公室场景；多智能体放置与生命周期
 */
(function () {
  const L = typeof LAYOUT !== 'undefined' ? LAYOUT : { game: { width: 1280, height: 720 }, areas: { breakroom: { x: 640, y: 360 } } };
  const STATE_TO_AREA = typeof STATE_TO_AREA !== 'undefined' ? STATE_TO_AREA : { idle: 'breakroom', executing: 'writing', waiting: 'writing', done: 'breakroom' };
  function getPos(area, slotIndex) {
    if (typeof getAreaPosition === 'function') return getAreaPosition(area, slotIndex);
    var arr = (typeof AREA_POSITIONS !== 'undefined' && AREA_POSITIONS[area]) || [{ x: 640, y: 360 }];
    return arr[slotIndex % arr.length] || arr[0];
  }

  let officeState = 'idle';
  let agentsList = [];
  let previousAgentIds = new Set();
  let lastStatusAt = 0;
  let lastAgentsAt = 0;
  const FETCH_INTERVAL = 2200;
  const AGENTS_INTERVAL = 2500;
  const MAIN_POSITION = { x: 640, y: 200 };

  function preload() {
    this.load.on('complete', function () {
      if (window.hideLoadingOverlay) window.hideLoadingOverlay();
    });
    this.load.image('pixel_bg', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  }

  function create() {
    const game = this;
    const w = L.game.width;
    const h = L.game.height;
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x2a2a45);
    var titleText = this.add.text(w / 2, h / 2 - 20, (window.t ? window.t('title') : 'Rzeclaw 办公室'), {
      fontFamily: 'Courier New',
      fontSize: '28px',
      color: '#ffd700',
    }).setOrigin(0.5);
    titleText.setName('titleText');
    this.add.text(w / 2, h / 2 + 20, (window.t ? window.t('mainStatusLabel') : '主状态: ') + officeState, {
      fontFamily: 'Courier New',
      fontSize: '18px',
      color: '#94a3b8',
    }).setOrigin(0.5).setName('statusText');
    const area = L.areas && L.areas.breakroom ? L.areas.breakroom : { x: w / 2, y: h / 2 };
    const star = this.add.circle(area.x, area.y, 24, 0xffd700, 0.9);
    star.setName('mainStar');
    star.setDepth(20);
    window.officeAgents = [];
    window.officeState = officeState;
    window.gameScene = game;
    window.agentContainers = {};
    window.onLangChange = function () {
      var sc = window.gameScene;
      if (!sc) return;
      var tt = sc.children.getByName('titleText');
      if (tt && tt.setText) tt.setText(window.t ? window.t('title') : 'Rzeclaw 办公室');
      var st = sc.children.getByName('statusText');
      if (st && st.setText) st.setText((window.t ? window.t('mainStatusLabel') : '主状态: ') + officeState);
    };
  }

  function update(time) {
    if (!window.Gateway || !window.Gateway.isConnected()) return;
    if (time - lastStatusAt > FETCH_INTERVAL) {
      lastStatusAt = time;
      window.Gateway.request('office.status', {}).then(function (r) {
        if (r.result && r.result.state) {
          officeState = r.result.state;
          window.officeState = officeState;
          const st = window.gameScene && window.gameScene.children.getByName('statusText');
          if (st) st.setText((window.t ? window.t('mainStatusLabel') : '主状态: ') + officeState);
          const star = window.gameScene && window.gameScene.children.getByName('mainStar');
          if (star && LAYOUT && LAYOUT.areas) {
            const areaName = officeState === 'executing' ? 'writing' : 'breakroom';
            const area = LAYOUT.areas[areaName] || LAYOUT.areas.breakroom;
            star.x = area.x;
            star.y = area.y;
          }
        }
      });
    }
    if (time - lastAgentsAt > AGENTS_INTERVAL) {
      lastAgentsAt = time;
      window.Gateway.request('agents.list', { sessionId: 'main' }).then(function (r) {
        if (r.result && Array.isArray(r.result.agents)) {
          agentsList = r.result.agents;
          window.officeAgents = agentsList;
          renderAgents(scene);
        }
      });
    }
  }

  function renderAgents(scene) {
    scene = scene || window.gameScene;
    const containers = window.agentContainers || {};
    if (!scene) return;
    var currentIds = new Set(agentsList.map(function (a) { return a.instanceId; }));
    var addedIds = new Set(Array.from(currentIds).filter(function (id) { return !previousAgentIds.has(id); }));
    var removedIds = new Set(Array.from(previousAgentIds).filter(function (id) { return !currentIds.has(id); }));
    previousAgentIds = new Set(currentIds);

    removedIds.forEach(function (id) {
      var c = containers[id];
      if (!c) return;
      var name = (c.getData && c.getData('name')) || id;
      if (window.showToast) window.showToast((name || id) + ' ' + (window.t ? window.t('toastLeft') : '已下班'));
      delete containers[id];
      scene.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: function () { c.destroy(); } });
    });

    var sorted = agentsList.slice().sort(function (a, b) {
      var areaA = STATE_TO_AREA[a.state] || 'breakroom';
      var areaB = STATE_TO_AREA[b.state] || 'breakroom';
      if (areaA !== areaB) return areaA.localeCompare(areaB);
      if (a.blueprintId !== b.blueprintId) return (a.blueprintId || '').localeCompare(b.blueprintId || '');
      return (a.instanceId || '').localeCompare(b.instanceId || '');
    });
    var areaSlots = { breakroom: 0, writing: 0, error: 0 };
    var mainDrawn = false;
    sorted.forEach(function (agent) {
      var area = STATE_TO_AREA[agent.state] || 'breakroom';
      var isMain = !!agent.isMain && !mainDrawn;
      if (isMain) mainDrawn = true;
      var slotIndex = isMain ? 0 : (areaSlots[area] || 0);
      if (!isMain) areaSlots[area] = slotIndex + 1;
      var pos = isMain ? MAIN_POSITION : getPos(area, slotIndex);
      var container = containers[agent.instanceId];
      var isNew = addedIds.has(agent.instanceId);
      if (!container) {
        container = scene.add.container(pos.x, pos.y);
        container.setName('agent_' + agent.instanceId);
        if (container.setData) container.setData('name', agent.name || agent.blueprintId);
        var icon = scene.add.text(0, 0, '\u2B50', { fontSize: isMain ? '28px' : '24px' }).setOrigin(0.5);
        var label = scene.add.text(0, isMain ? -34 : -28, agent.name || agent.blueprintId, { fontSize: isMain ? '14px' : '12px', color: isMain ? '#ffd700' : '#e5e7eb' }).setOrigin(0.5);
        container.add([icon, label]);
        if (isNew && window.showToast) window.showToast((agent.name || agent.blueprintId) + ' ' + (window.t ? window.t('toastJoined') : '入职'));
        if (isNew) {
          container.setAlpha(0);
          scene.tweens.add({ targets: container, alpha: 1, duration: 400 });
          var badge = scene.add.text(18, -18, '\u65B0', { fontSize: '10px', color: '#22c55e' }).setOrigin(0.5);
          container.add(badge);
          setTimeout(function () { if (badge && badge.scene) badge.destroy(); }, 3000);
        }
        container.setDepth(isMain ? 1300 : 1200);
        if (isMain) container.setScale(1.2);
        containers[agent.instanceId] = container;
      } else {
        if (container.setData) container.setData('name', agent.name || agent.blueprintId);
        var lbl = container.getAt(1);
        if (lbl && lbl.setText) lbl.setText(agent.name || agent.blueprintId);
        if (lbl && lbl.setFill) lbl.setFill(agent.isMain ? '#ffd700' : '#e5e7eb');
        container.setDepth(agent.isMain ? 1300 : 1200);
        container.setScale(agent.isMain ? 1.2 : 1);
      }
      container.setPosition(pos.x, pos.y);
    });
  }

  const config = {
    type: Phaser.AUTO,
    width: L.game.width,
    height: L.game.height,
    parent: 'game-container',
    pixelArt: true,
    scene: { preload: preload, create: create, update: update },
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.updateStatusBar) window.updateStatusBar('statusConnecting');
    window.Gateway.connect().then(function () {
      window.officeGame = new Phaser.Game(config);
      if (window.fetchMemo) window.fetchMemo();
    }).catch(function () {
      if (window.updateStatusBar) window.updateStatusBar('statusDisconnected');
      window.officeGame = new Phaser.Game(config);
    });
  });
})();
