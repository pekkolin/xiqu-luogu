/**
 * 戏曲锣鼓 - 传统配色方案、快捷键辅助与内置预设布局
 */
(function (global) {
  'use strict';

  const PAD_COLORS = [
    { id: 'cinnabar', name: '朱砂红', bg: '#9e2a2b', border: '#e05a47', glow: 'rgba(224, 90, 71, 0.55)' },
    { id: 'gold',     name: '鎏金黄', bg: '#9a6b18', border: '#e6b84c', glow: 'rgba(230, 184, 76, 0.55)' },
    { id: 'jade',     name: '翠玉青', bg: '#1d6f5c', border: '#46c3a4', glow: 'rgba(70, 195, 164, 0.5)' },
    { id: 'indigo',   name: '靛青蓝', bg: '#244778', border: '#5c95e6', glow: 'rgba(92, 149, 230, 0.5)' },
    { id: 'amber',    name: '琥珀橙', bg: '#a34c18', border: '#f08b46', glow: 'rgba(240, 139, 70, 0.55)' },
    { id: 'plum',     name: '紫檀紫', bg: '#612d66', border: '#b86cc0', glow: 'rgba(184, 108, 192, 0.5)' },
    { id: 'crimson',  name: '胭脂绛', bg: '#7f2445', border: '#d95f8b', glow: 'rgba(217, 95, 139, 0.5)' },
    { id: 'teal',     name: '松石绿', bg: '#1e5b68', border: '#47b6cc', glow: 'rgba(71, 182, 204, 0.5)' },
    { id: 'ochre',    name: '檀木棕', bg: '#68442a', border: '#c48f65', glow: 'rgba(196, 143, 101, 0.5)' },
    { id: 'ink',      name: '玄墨灰', bg: '#323640', border: '#7b8499', glow: 'rgba(123, 132, 153, 0.45)' }
  ];

  const COLOR_MAP = {};
  PAD_COLORS.forEach(function (c) {
    COLOR_MAP[c.id] = c;
  });

  // 键盘默认按行分配序列（最多 6x6 = 36 键）
  const DEFAULT_KEY_POOL = [
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
    'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY',
    'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH',
    'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN',
    'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyU', 'KeyI',
    'KeyO', 'KeyP', 'KeyJ', 'KeyK', 'KeyL', 'KeyM'
  ];

  function formatKeyCode(code) {
    if (!code) return '';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
    const map = {
      Space: 'Space',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backquote: '`'
    };
    return map[code] || code;
  }

  function makePad(id, label, sublabel, color, keyCode, layers, chokeOnHit) {
    return {
      id: id,
      label: label,
      sublabel: sublabel || '',
      color: color || 'ink',
      keyCode: keyCode || '',
      chokeOnHit: Boolean(chokeOnHit),
      layers: (layers || []).slice(0, 3).map(function (l) {
        return {
          instrument: l.instrument,
          volume: l.volume !== undefined ? l.volume : 1.0,
          pitch: l.pitch !== undefined ? l.pitch : 0,
          delayMs: l.delayMs !== undefined ? l.delayMs : 0
        };
      })
    };
  }

  const BUILTIN_PRESETS = [
    {
      id: 'jingju_luogujing',
      name: '京剧武场 · 锣鼓经 (4×4)',
      builtin: true,
      rows: 4,
      cols: 4,
      pads: [
        // Row 1: 氛围与特色法器
        makePad('p1', '风', '风锣', 'teal', 'Digit1', [{ instrument: 'fengluo', volume: 0.95 }]),
        makePad('p2', '叮', '碰铃', 'indigo', 'Digit2', [{ instrument: 'pengling', volume: 0.9 }]),
        makePad('p3', '木', '木鱼', 'ochre', 'Digit3', [{ instrument: 'muyu', volume: 0.95 }]),
        makePad('p4', '梆', '梆子', 'ochre', 'Digit4', [{ instrument: 'bangzi', volume: 0.95 }]),

        // Row 2: 堂鼓、广钹与闷锣
        makePad('p5', '咚', '大堂鼓', 'amber', 'KeyQ', [{ instrument: 'datanggu', volume: 1.05 }]),
        makePad('p6', '冬', '小堂鼓', 'amber', 'KeyW', [{ instrument: 'xiaotanggu', volume: 1.0 }]),
        makePad('p7', '冲', '大锣+堂鼓+铙钹', 'crimson', 'KeyE', [
          { instrument: 'daluo', volume: 1.0 },
          { instrument: 'datanggu', volume: 1.05 },
          { instrument: 'naobo', volume: 0.78 }
        ]),
        makePad('p8', '闷', '闷大锣·止音', 'ink', 'KeyR', [
          { instrument: 'daluo_soft', volume: 0.95 }
        ], true),

        // Row 3: 司鼓指挥行（单皮、檀板、组合）
        makePad('p9', '单', '板鼓(大)', 'jade', 'KeyA', [{ instrument: 'bangu', volume: 1.0 }]),
        makePad('p10', '板', '檀板', 'jade', 'KeyS', [{ instrument: 'ban', volume: 1.0 }]),
        makePad('p11', '八', '板鼓+檀板', 'teal', 'KeyD', [
          { instrument: 'bangu', volume: 0.95 },
          { instrument: 'ban', volume: 0.9 }
        ]),
        makePad('p12', '撕', '鼓边', 'plum', 'KeyF', [{ instrument: 'bangu_rim', volume: 0.95 }]),

        // Row 4: 核心锣鼓经（台、才、仓、扑）
        makePad('p13', '台', '小锣', 'gold', 'KeyZ', [{ instrument: 'xiaoluo', volume: 1.0 }]),
        makePad('p14', '才', '铙钹+小锣', 'gold', 'KeyX', [
          { instrument: 'naobo', volume: 0.95 },
          { instrument: 'xiaoluo', volume: 0.62 }
        ]),
        makePad('p15', '仓', '大锣+铙钹+小锣', 'cinnabar', 'KeyC', [
          { instrument: 'daluo', volume: 1.0 },
          { instrument: 'naobo', volume: 0.76 },
          { instrument: 'xiaoluo', volume: 0.48 }
        ]),
        makePad('p16', '扑', '闷钹·止音', 'ink', 'KeyV', [
          { instrument: 'naobo_choke', volume: 1.0 }
        ], true)
      ]
    },
    {
      id: 'single_instruments',
      name: '传统武场 · 单乐器全集 (3×4)',
      builtin: true,
      rows: 3,
      cols: 4,
      pads: [
        makePad('s1', '大堂鼓', '咚', 'amber', 'KeyQ', [{ instrument: 'datanggu', volume: 1.05 }]),
        makePad('s2', '小堂鼓', '冬', 'amber', 'KeyW', [{ instrument: 'xiaotanggu', volume: 1.0 }]),
        makePad('s3', '梆子', '梆', 'ochre', 'KeyE', [{ instrument: 'bangzi', volume: 1.0 }]),
        makePad('s4', '木鱼', '木', 'ochre', 'KeyR', [{ instrument: 'muyu', volume: 1.0 }]),

        makePad('s5', '板鼓', '单皮', 'jade', 'KeyA', [{ instrument: 'bangu', volume: 1.0 }]),
        makePad('s6', '檀板', '拍板', 'jade', 'KeyS', [{ instrument: 'ban', volume: 1.0 }]),
        makePad('s7', '碰铃', '叮', 'indigo', 'KeyD', [{ instrument: 'pengling', volume: 0.9 }]),
        makePad('s8', '风锣', '风', 'teal', 'KeyF', [{ instrument: 'fengluo', volume: 0.95 }]),

        makePad('s9', '小锣', '台', 'gold', 'KeyZ', [{ instrument: 'xiaoluo', volume: 1.0 }]),
        makePad('s10', '铙钹', '才', 'gold', 'KeyX', [{ instrument: 'naobo', volume: 1.0 }]),
        makePad('s11', '大锣', '仓', 'cinnabar', 'KeyC', [{ instrument: 'daluo', volume: 1.0 }]),
        makePad('s12', '小钹', '七', 'crimson', 'KeyV', [{ instrument: 'xiaobo', volume: 1.0 }])
      ]
    },
    {
      id: 'compact_3x3',
      name: '精简大键 · 手机推荐 (3×3)',
      builtin: true,
      rows: 3,
      cols: 3,
      pads: [
        makePad('m1', '咚', '大堂鼓', 'amber', 'KeyQ', [{ instrument: 'datanggu', volume: 1.05 }]),
        makePad('m2', '冲', '大锣+堂鼓+铙钹', 'crimson', 'KeyW', [
          { instrument: 'daluo', volume: 1.0 },
          { instrument: 'datanggu', volume: 1.05 },
          { instrument: 'naobo', volume: 0.78 }
        ]),
        makePad('m3', '扑', '闷钹·止音', 'ink', 'KeyE', [{ instrument: 'naobo_choke', volume: 1.0 }], true),

        makePad('m4', '单', '板鼓', 'jade', 'KeyA', [{ instrument: 'bangu', volume: 1.0 }]),
        makePad('m5', '板', '檀板', 'jade', 'KeyS', [{ instrument: 'ban', volume: 1.0 }]),
        makePad('m6', '八', '板鼓+檀板', 'teal', 'KeyD', [
          { instrument: 'bangu', volume: 0.95 },
          { instrument: 'ban', volume: 0.9 }
        ]),

        makePad('m7', '台', '小锣', 'gold', 'KeyZ', [{ instrument: 'xiaoluo', volume: 1.0 }]),
        makePad('m8', '才', '铙钹+小锣', 'gold', 'KeyX', [
          { instrument: 'naobo', volume: 0.95 },
          { instrument: 'xiaoluo', volume: 0.62 }
        ]),
        makePad('m9', '仓', '大锣+铙钹+小锣', 'cinnabar', 'KeyC', [
          { instrument: 'daluo', volume: 1.0 },
          { instrument: 'naobo', volume: 0.76 },
          { instrument: 'xiaoluo', volume: 0.48 }
        ])
      ]
    }
  ];

  // 经典京剧锣鼓经速查口诀（供演奏参考）
  const LUOGUJING_CHEATSHEET = [
    { name: '四击头', pattern: '单 · 台 · 仓  |  才 · 台 · 仓  (亮相关目/起势)' },
    { name: '急急风', pattern: '单 仓 才 仓 才 仓 才 仓 · 扑  (快速追赶/武打)' },
    { name: '冲头', pattern: '单 咚 仓 才 仓  |  才 仓 才 仓  (人物急上/惊变)' },
    { name: '长锤', pattern: '单 仓 · 才 仓 · 才 仓 · 扑  (大场面上场/收尾)' },
    { name: '小锣抽头', pattern: '单 · 台 · 单 · 台  (文场花旦/丑角轻快出场)' }
  ];

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function createEmptyPad(index, usedKeyCodes) {
    let keyCode = '';
    const used = usedKeyCodes || new Set();
    for (let i = 0; i < DEFAULT_KEY_POOL.length; i++) {
      if (!used.has(DEFAULT_KEY_POOL[i])) {
        keyCode = DEFAULT_KEY_POOL[i];
        used.add(keyCode);
        break;
      }
    }
    return makePad(
      'pad_' + Date.now() + '_' + index + '_' + Math.floor(Math.random() * 1000),
      '键' + (index + 1),
      '',
      'ink',
      keyCode,
      [{ instrument: 'bangu', volume: 0.9 }],
      false
    );
  }

  global.OperaPresets = {
    PAD_COLORS: PAD_COLORS,
    COLOR_MAP: COLOR_MAP,
    BUILTIN_PRESETS: BUILTIN_PRESETS,
    LUOGUJING_CHEATSHEET: LUOGUJING_CHEATSHEET,
    formatKeyCode: formatKeyCode,
    cloneDeep: cloneDeep,
    createEmptyPad: createEmptyPad
  };
})(window);
