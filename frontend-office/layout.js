/**
 * Phase 15 WO-OF-011: 办公室布局与层级（与 Star-Office-UI 对齐）
 * 画布尺寸、区域坐标、家具、槽位统一管理
 */
const LAYOUT = {
  game: { width: 1280, height: 720 },
  areas: {
    door: { x: 640, y: 550 },
    writing: { x: 320, y: 360 },
    researching: { x: 320, y: 360 },
    error: { x: 1066, y: 180 },
    breakroom: { x: 640, y: 360 },
  },
  furniture: {
    sofa: { x: 670, y: 144, origin: { x: 0, y: 0 }, depth: 10 },
    desk: { x: 218, y: 417, origin: { x: 0.5, y: 0.5 }, depth: 1000 },
    flower: { x: 310, y: 390, origin: { x: 0.5, y: 0.5 }, depth: 1100, scale: 0.8 },
    starWorking: { x: 217, y: 333, origin: { x: 0.5, y: 0.5 }, depth: 900, scale: 1.32 },
    plants: [
      { x: 565, y: 178, depth: 5 },
      { x: 230, y: 185, depth: 5 },
      { x: 977, y: 496, depth: 5 },
    ],
    poster: { x: 252, y: 66, depth: 4 },
    coffeeMachine: { x: 659, y: 397, origin: { x: 0.5, y: 0.5 }, depth: 99 },
    serverroom: { x: 1021, y: 142, origin: { x: 0.5, y: 0.5 }, depth: 2 },
    errorBug: { x: 1007, y: 221, origin: { x: 0.5, y: 0.5 }, depth: 50, scale: 0.9 },
    syncAnim: { x: 1157, y: 592, origin: { x: 0.5, y: 0.5 }, depth: 40 },
    cat: { x: 94, y: 557, origin: { x: 0.5, y: 0.5 }, depth: 2000 },
  },
  plaque: { x: 640, y: 720 - 36, width: 420, height: 44 },
  totalAssets: 1,
};

/** Rzeclaw 实例 state → 办公室 area */
const STATE_TO_AREA = {
  idle: 'breakroom',
  executing: 'writing',
  waiting: 'writing',
  done: 'breakroom',
};

/** 每区域多角色槽位（可扩展）；与 Star-Office-UI AREA_POSITIONS 对齐 */
const AREA_POSITIONS = {
  breakroom: [
    { x: 620, y: 180 }, { x: 560, y: 220 }, { x: 680, y: 210 }, { x: 540, y: 170 },
    { x: 700, y: 240 }, { x: 600, y: 250 }, { x: 650, y: 160 }, { x: 580, y: 200 },
    { x: 640, y: 200 }, { x: 590, y: 190 }, { x: 670, y: 230 }, { x: 530, y: 210 },
  ],
  writing: [
    { x: 760, y: 320 }, { x: 830, y: 280 }, { x: 690, y: 350 }, { x: 770, y: 260 },
    { x: 850, y: 340 }, { x: 720, y: 300 }, { x: 800, y: 370 }, { x: 750, y: 240 },
    { x: 780, y: 310 }, { x: 810, y: 330 }, { x: 740, y: 290 }, { x: 820, y: 350 },
  ],
  error: [
    { x: 180, y: 260 }, { x: 120, y: 220 }, { x: 240, y: 230 }, { x: 160, y: 200 },
    { x: 220, y: 270 }, { x: 140, y: 250 }, { x: 200, y: 210 }, { x: 260, y: 260 },
    { x: 190, y: 240 }, { x: 210, y: 250 }, { x: 150, y: 230 }, { x: 230, y: 270 },
  ],
};

/** WO-OF-031: 按 area + slotIndex 取坐标；超出预定义槽位时用网格生成，保证稳定不重叠 */
function getAreaPosition(area, slotIndex) {
  const positions = AREA_POSITIONS[area] || AREA_POSITIONS.breakroom;
  if (slotIndex < positions.length) return positions[slotIndex];
  const areaCenter = LAYOUT.areas[area] || LAYOUT.areas.breakroom;
  const cols = 4;
  const spacing = 44;
  const row = Math.floor((slotIndex - positions.length) / cols);
  const col = (slotIndex - positions.length) % cols;
  return {
    x: areaCenter.x - (cols * spacing) / 2 + col * spacing + spacing / 2,
    y: areaCenter.y + row * spacing,
  };
}
