/**
 * 戏曲锣鼓 · 电子打击垫 — 主交互逻辑与状态管理
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'opera_luogu_pad_v1';
  const Audio = window.OperaAudio;
  const Presets = window.OperaPresets;

  // ======================== 应用状态 ========================
  const state = {
    presets: [],
    activePresetId: '',
    editMode: false,
    swapMode: false,
    swapSourceIdx: -1,
    editingPadIdx: -1,
    isBindingKey: false,
    settings: {
      masterVolume: 0.85,
      reverbMode: 'room',
      showKeys: true,
      showSubs: true
    }
  };

  let keyCodeToIdx = {};
  const padHitTimers = new Map();
  let toastTimer = null;

  // ======================== DOM 引用 ========================
  const el = {
    presetSelect: document.getElementById('presetSelect'),
    btnNewPreset: document.getElementById('btnNewPreset'),
    reverbBtns: document.querySelectorAll('.seg-btn[data-reverb]'),
    masterVolume: document.getElementById('masterVolume'),
    btnChoke: document.getElementById('btnChoke'),
    btnEditMode: document.getElementById('btnEditMode'),
    editModeText: document.getElementById('editModeText'),

    editToolbar: document.getElementById('editToolbar'),
    btnRowDec: document.getElementById('btnRowDec'),
    btnRowInc: document.getElementById('btnRowInc'),
    rowCountVal: document.getElementById('rowCountVal'),
    btnColDec: document.getElementById('btnColDec'),
    btnColInc: document.getElementById('btnColInc'),
    colCountVal: document.getElementById('colCountVal'),
    btnSwapMode: document.getElementById('btnSwapMode'),
    btnRenamePreset: document.getElementById('btnRenamePreset'),
    btnDeletePreset: document.getElementById('btnDeletePreset'),
    btnResetPreset: document.getElementById('btnResetPreset'),
    btnExportJson: document.getElementById('btnExportJson'),
    btnImportJson: document.getElementById('btnImportJson'),
    importFileInput: document.getElementById('importFileInput'),
    chkShowKeys: document.getElementById('chkShowKeys'),
    chkShowSubs: document.getElementById('chkShowSubs'),
    editHintBar: document.getElementById('editHintBar'),

    padGrid: document.getElementById('padGrid'),
    btnToggleCheat: document.getElementById('btnToggleCheat'),
    cheatSheet: document.getElementById('cheatSheet'),

    editorBackdrop: document.getElementById('editorBackdrop'),
    padEditor: document.getElementById('padEditor'),
    editorPadIndex: document.getElementById('editorPadIndex'),
    btnCloseEditor: document.getElementById('btnCloseEditor'),
    inputPadLabel: document.getElementById('inputPadLabel'),
    inputPadSub: document.getElementById('inputPadSub'),
    colorPalette: document.getElementById('colorPalette'),
    btnBindKey: document.getElementById('btnBindKey'),
    btnClearKey: document.getElementById('btnClearKey'),
    keyBindHint: document.getElementById('keyBindHint'),
    chkPadChoke: document.getElementById('chkPadChoke'),
    btnAddLayer: document.getElementById('btnAddLayer'),
    layersContainer: document.getElementById('layersContainer'),
    btnPreviewPad: document.getElementById('btnPreviewPad'),
    btnDoneEditor: document.getElementById('btnDoneEditor'),

    toast: document.getElementById('toast')
  };

  // ======================== 持久化存储 ========================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.presets) && parsed.presets.length > 0) {
          state.presets = parsed.presets;
          state.activePresetId = parsed.activePresetId || parsed.presets[0].id;
          if (parsed.settings) {
            Object.assign(state.settings, parsed.settings);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('读取本地配置失败，使用默认预设:', err);
    }
    state.presets = Presets.cloneDeep(Presets.BUILTIN_PRESETS);
    state.activePresetId = state.presets[0].id;
  }

  function saveState() {
    try {
      const payload = {
        presets: state.presets,
        activePresetId: state.activePresetId,
        settings: state.settings
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('保存配置失败:', err);
    }
  }

  function getActivePreset() {
    let found = state.presets.find(function (p) {
      return p.id === state.activePresetId;
    });
    if (!found) {
      found = state.presets[0];
      state.activePresetId = found.id;
    }
    return found;
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.add('hidden');
    }, 2200);
  }

  // ======================== 辅助计算 ========================
  function getAutoSubtitle(pad) {
    if (pad.sublabel && pad.sublabel.trim()) {
      return pad.sublabel.trim();
    }
    if (!pad.layers || pad.layers.length === 0) {
      return '未绑定乐器';
    }
    return pad.layers
      .map(function (l) {
        const inst = Audio.INSTRUMENT_MAP[l.instrument];
        return inst ? inst.short : l.instrument;
      })
      .join('+');
  }

  function rebuildKeyMap() {
    keyCodeToIdx = {};
    const preset = getActivePreset();
    preset.pads.forEach(function (pad, idx) {
      if (pad.keyCode) {
        keyCodeToIdx[pad.keyCode] = idx;
      }
    });
  }

  // ======================== 渲染函数 ========================
  function renderPresetSelector() {
    const preset = getActivePreset();
    el.presetSelect.innerHTML = '';
    state.presets.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === preset.id) opt.selected = true;
      el.presetSelect.appendChild(opt);
    });

    // 内置方案显示“恢复默认”，自定义方案显示“删除方案”
    const isBuiltin = Presets.BUILTIN_PRESETS.some(function (b) {
      return b.id === preset.id;
    });
    el.btnResetPreset.classList.toggle('hidden', !isBuiltin);
    el.btnDeletePreset.classList.toggle('hidden', isBuiltin || state.presets.length <= 1);
  }

  function renderGrid() {
    const preset = getActivePreset();
    rebuildKeyMap();

    el.rowCountVal.textContent = preset.rows;
    el.colCountVal.textContent = preset.cols;

    el.padGrid.style.gridTemplateColumns = 'repeat(' + preset.cols + ', minmax(0, 1fr))';
    el.padGrid.style.gridTemplateRows = 'repeat(' + preset.rows + ', minmax(0, 1fr))';
    el.padGrid.classList.toggle('editing-mode', state.editMode);
    el.padGrid.classList.toggle('hide-keys', !state.settings.showKeys);
    el.padGrid.classList.toggle('hide-subs', !state.settings.showSubs);

    el.padGrid.innerHTML = '';
    const total = preset.rows * preset.cols;

    for (let i = 0; i < total; i++) {
      const pad = preset.pads[i];
      const color = Presets.COLOR_MAP[pad.color] || Presets.COLOR_MAP.ink;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pad';
      btn.dataset.index = String(i);
      btn.style.setProperty('--pad-bg', color.bg);
      btn.style.setProperty('--pad-border', color.border);
      btn.style.setProperty('--pad-glow', color.glow);

      if (state.editMode && i === state.editingPadIdx) {
        btn.classList.add('is-selected');
      }
      if (state.editMode && state.swapMode && i === state.swapSourceIdx) {
        btn.classList.add('is-swap-source');
      }

      // 快捷键角标
      if (pad.keyCode) {
        const keyTag = document.createElement('span');
        keyTag.className = 'pad-key';
        keyTag.textContent = Presets.formatKeyCode(pad.keyCode);
        btn.appendChild(keyTag);
      }

      // 右上角标记（多乐器层数 / 止音）
      const badges = document.createElement('div');
      badges.className = 'pad-badges';
      if (pad.chokeOnHit) {
        const bChoke = document.createElement('span');
        bChoke.className = 'pad-badge choke';
        bChoke.textContent = '止';
        badges.appendChild(bChoke);
      }
      if (pad.layers && pad.layers.length > 1) {
        const bCount = document.createElement('span');
        bCount.className = 'pad-badge';
        bCount.textContent = pad.layers.length + '音';
        badges.appendChild(bCount);
      }
      if (badges.childNodes.length > 0) {
        btn.appendChild(badges);
      }

      // 主标题
      const labelEl = document.createElement('div');
      labelEl.className = 'pad-label' + ((pad.label || '').length >= 3 ? ' long-text' : '');
      labelEl.textContent = pad.label || '未命名';
      btn.appendChild(labelEl);

      // 副标题 / 乐器标注
      const subEl = document.createElement('div');
      subEl.className = 'pad-sub';
      subEl.textContent = getAutoSubtitle(pad);
      btn.appendChild(subEl);

      // 编辑模式角标提示
      if (state.editMode) {
        const editTag = document.createElement('span');
        editTag.className = 'pad-edit-tag';
        editTag.textContent = state.swapMode ? (i === state.swapSourceIdx ? '选目标' : '⇄') : '✎';
        btn.appendChild(editTag);
      }

      el.padGrid.appendChild(btn);
    }
  }

  function renderCheatSheet() {
    el.cheatSheet.innerHTML = '';
    Presets.LUOGUJING_CHEATSHEET.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'cheat-item';
      const title = document.createElement('div');
      title.className = 'cheat-name';
      title.textContent = item.name;
      const pattern = document.createElement('div');
      pattern.className = 'cheat-pattern';
      pattern.textContent = item.pattern;
      card.appendChild(title);
      card.appendChild(pattern);
      el.cheatSheet.appendChild(card);
    });
  }

  function syncSettingsUI() {
    el.masterVolume.value = String(state.settings.masterVolume);
    Audio.engine.setMasterVolume(state.settings.masterVolume);
    Audio.engine.setReverbMode(state.settings.reverbMode);

    el.reverbBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.reverb === state.settings.reverbMode);
    });
    el.chkShowKeys.checked = state.settings.showKeys;
    el.chkShowSubs.checked = state.settings.showSubs;
  }

  // ======================== 演奏触发（零延迟） ========================
  function hitPad(idx) {
    const preset = getActivePreset();
    const pad = preset.pads[idx];
    if (!pad) return;

    // 1. 立即发声
    Audio.engine.triggerPad(pad);

    // 2. 视觉瞬时击打反馈
    const padEl = el.padGrid.children[idx];
    if (padEl) {
      padEl.classList.remove('is-hit');
      // 强制触发极轻量重绘以支持高速连击闪光
      void padEl.offsetWidth;
      padEl.classList.add('is-hit');

      if (padHitTimers.has(idx)) {
        clearTimeout(padHitTimers.get(idx));
      }
      padHitTimers.set(
        idx,
        setTimeout(function () {
          padEl.classList.remove('is-hit');
          padHitTimers.delete(idx);
        }, 115)
      );
    }
  }

  // ======================== 编辑模式与网格行列调整 ========================
  function setEditMode(enabled) {
    state.editMode = enabled;
    state.swapMode = false;
    state.swapSourceIdx = -1;
    el.btnEditMode.classList.toggle('editing', enabled);
    el.btnEditMode.setAttribute('aria-pressed', String(enabled));
    el.editModeText.textContent = enabled ? '退出编辑' : '自定义编辑';
    el.editToolbar.classList.toggle('hidden', !enabled);
    el.btnSwapMode.classList.remove('active-toggle');
    el.btnSwapMode.setAttribute('aria-pressed', 'false');
    updateEditHint();

    if (!enabled) {
      closeEditor();
    }
    renderGrid();
  }

  function updateEditHint() {
    if (state.swapMode) {
      el.editHintBar.textContent =
        state.swapSourceIdx === -1
          ? '互换模式：请点击第一个要移动的打击垫。'
          : '互换模式：已选中源按键，请点击另一个打击垫完成位置互换。';
    } else {
      el.editHintBar.textContent =
        '点击任意打击垫可修改名称、配色、快捷键，并绑定最多 3 种戏曲乐器组合；所有修改自动保存。';
    }
  }

  /**
   * 保持原有二维坐标不变的前提下增减行数/列数
   */
  function resizeGrid(newRows, newCols) {
    const preset = getActivePreset();
    const clampedRows = Math.max(2, Math.min(6, newRows));
    const clampedCols = Math.max(2, Math.min(6, newCols));
    if (clampedRows === preset.rows && clampedCols === preset.cols) return;

    const oldRows = preset.rows;
    const oldCols = preset.cols;
    const oldPads = preset.pads;

    const usedKeys = new Set();
    for (let r = 0; r < Math.min(oldRows, clampedRows); r++) {
      for (let c = 0; c < Math.min(oldCols, clampedCols); c++) {
        const existing = oldPads[r * oldCols + c];
        if (existing && existing.keyCode) usedKeys.add(existing.keyCode);
      }
    }

    const nextPads = [];
    for (let r = 0; r < clampedRows; r++) {
      for (let c = 0; c < clampedCols; c++) {
        if (r < oldRows && c < oldCols && oldPads[r * oldCols + c]) {
          nextPads.push(oldPads[r * oldCols + c]);
        } else {
          nextPads.push(Presets.createEmptyPad(r * clampedCols + c, usedKeys));
        }
      }
    }

    preset.rows = clampedRows;
    preset.cols = clampedCols;
    preset.pads = nextPads;

    closeEditor();
    state.swapSourceIdx = -1;
    saveState();
    renderGrid();
  }

  // ======================== 打击垫编辑器抽屉 ========================
  function openEditor(padIdx) {
    const preset = getActivePreset();
    const pad = preset.pads[padIdx];
    if (!pad) return;

    state.editingPadIdx = padIdx;
    state.isBindingKey = false;

    const row = Math.floor(padIdx / preset.cols) + 1;
    const col = (padIdx % preset.cols) + 1;
    el.editorPadIndex.textContent = '第 ' + row + ' 行 · 第 ' + col + ' 列';

    el.inputPadLabel.value = pad.label || '';
    el.inputPadSub.value = pad.sublabel || '';
    el.chkPadChoke.checked = Boolean(pad.chokeOnHit);

    renderColorPalette(pad.color);
    updateKeyBindButton(pad.keyCode);
    renderLayersEditor(pad);

    el.editorBackdrop.classList.remove('hidden');
    el.padEditor.classList.remove('hidden');
    renderGrid();
  }

  function closeEditor() {
    state.editingPadIdx = -1;
    state.isBindingKey = false;
    el.editorBackdrop.classList.add('hidden');
    el.padEditor.classList.add('hidden');
    el.btnBindKey.classList.remove('listening');
    if (state.editMode) {
      renderGrid();
    }
  }

  function renderColorPalette(selectedColorId) {
    el.colorPalette.innerHTML = '';
    Presets.PAD_COLORS.forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (c.id === selectedColorId ? ' selected' : '');
      btn.style.background = c.bg;
      btn.style.borderColor = c.id === selectedColorId ? '#fff' : c.border;
      btn.textContent = c.name.slice(0, 2);
      btn.title = c.name;
      btn.addEventListener('click', function () {
        const pad = getEditedPad();
        if (!pad) return;
        pad.color = c.id;
        saveState();
        renderColorPalette(c.id);
        renderGrid();
      });
      el.colorPalette.appendChild(btn);
    });
  }

  function updateKeyBindButton(keyCode) {
    el.btnBindKey.classList.toggle('listening', state.isBindingKey);
    if (state.isBindingKey) {
      el.btnBindKey.textContent = '请按下键盘按键...';
      el.keyBindHint.textContent = '按 Esc 取消；按 Space 会冲突，建议选字母或数字键';
    } else {
      el.btnBindKey.textContent = keyCode ? Presets.formatKeyCode(keyCode) : '未绑定';
      el.keyBindHint.textContent = '点击按钮后按键盘任意键绑定';
    }
  }

  function getEditedPad() {
    if (state.editingPadIdx < 0) return null;
    const preset = getActivePreset();
    return preset.pads[state.editingPadIdx] || null;
  }

  function buildInstrumentSelect(selectedId) {
    const select = document.createElement('select');
    select.className = 'layer-select';

    const categories = ['锣类', '钹类', '鼓类', '板/击节'];
    categories.forEach(function (cat) {
      const group = document.createElement('optgroup');
      group.label = cat;
      Audio.INSTRUMENTS.filter(function (inst) {
        return inst.category === cat;
      }).forEach(function (inst) {
        const opt = document.createElement('option');
        opt.value = inst.id;
        opt.textContent = inst.name + ' — ' + inst.desc;
        if (inst.id === selectedId) opt.selected = true;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
    return select;
  }

  function renderLayersEditor(pad) {
    el.layersContainer.innerHTML = '';
    const layers = pad.layers || [];
    el.btnAddLayer.disabled = layers.length >= 3;
    el.btnAddLayer.textContent = layers.length >= 3 ? '已满 3 种' : '＋ 添加乐器 (' + layers.length + '/3)';

    if (layers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'layers-empty';
      empty.textContent = '当前未绑定乐器（如果开启了“按下时止音”，可作为纯止音键使用）';
      el.layersContainer.appendChild(empty);
      return;
    }

    layers.forEach(function (layer, idx) {
      const card = document.createElement('div');
      card.className = 'layer-card';

      // 顶部：编号 + 乐器下拉 + 试听单音 + 删除
      const top = document.createElement('div');
      top.className = 'layer-top';

      const tag = document.createElement('span');
      tag.className = 'layer-idx';
      tag.textContent = '音色 ' + (idx + 1);

      const select = buildInstrumentSelect(layer.instrument);
      select.addEventListener('change', function () {
        layer.instrument = select.value;
        saveState();
        renderGrid();
        Audio.engine.triggerInstrument(layer.instrument, {
          volume: layer.volume,
          pitch: layer.pitch,
          delayMs: 0
        });
      });

      const btnTest = document.createElement('button');
      btnTest.type = 'button';
      btnTest.className = 'icon-btn';
      btnTest.title = '试听此乐器';
      btnTest.textContent = '▶';
      btnTest.addEventListener('click', function () {
        Audio.engine.triggerInstrument(layer.instrument, {
          volume: layer.volume,
          pitch: layer.pitch,
          delayMs: 0
        });
      });

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'icon-btn btn-danger-text';
      btnDel.title = '移除此乐器';
      btnDel.textContent = '✕';
      btnDel.addEventListener('click', function () {
        pad.layers.splice(idx, 1);
        saveState();
        renderLayersEditor(pad);
        renderGrid();
      });

      top.appendChild(tag);
      top.appendChild(select);
      top.appendChild(btnTest);
      top.appendChild(btnDel);

      // 底部：力度 / 音高 / 延迟 滑块
      const sliders = document.createElement('div');
      sliders.className = 'layer-sliders';

      // 1. 力度音量
      sliders.appendChild(
        createMiniSlider('力度', Math.round((layer.volume || 1) * 100) + '%', 0.2, 1.4, 0.01, layer.volume || 1, function (val, valEl) {
          layer.volume = val;
          valEl.textContent = Math.round(val * 100) + '%';
          saveState();
        })
      );

      // 2. 音高微调
      const pitchVal = layer.pitch || 0;
      sliders.appendChild(
        createMiniSlider('音高', (pitchVal > 0 ? '+' : '') + pitchVal, -6, 6, 1, pitchVal, function (val, valEl) {
          layer.pitch = val;
          valEl.textContent = (val > 0 ? '+' : '') + val;
          saveState();
        })
      );

      // 3. 微延迟（用于装饰音/滚击组合）
      const delayVal = layer.delayMs || 0;
      sliders.appendChild(
        createMiniSlider('延迟', delayVal + 'ms', 0, 100, 5, delayVal, function (val, valEl) {
          layer.delayMs = val;
          valEl.textContent = val + 'ms';
          saveState();
        })
      );

      card.appendChild(top);
      card.appendChild(sliders);
      el.layersContainer.appendChild(card);
    });
  }

  function createMiniSlider(title, initText, min, max, step, value, onInput) {
    const wrap = document.createElement('label');
    wrap.className = 'mini-slider';

    const head = document.createElement('div');
    head.className = 'mini-slider-head';
    const span = document.createElement('span');
    span.textContent = title;
    const valEl = document.createElement('b');
    valEl.textContent = initText;
    head.appendChild(span);
    head.appendChild(valEl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', function () {
      onInput(Number(input.value), valEl);
    });

    wrap.appendChild(head);
    wrap.appendChild(input);
    return wrap;
  }

  // ======================== 事件绑定 ========================
  function bindEvents() {
    // 核心打击垫：使用 pointerdown 实现零延迟 + 真正的多点触控
    el.padGrid.addEventListener('pointerdown', function (e) {
      const padBtn = e.target.closest('.pad');
      if (!padBtn) return;
      e.preventDefault();

      const idx = Number(padBtn.dataset.index);
      if (Number.isNaN(idx)) return;

      if (!state.editMode) {
        hitPad(idx);
        return;
      }

      // 编辑模式：互换位置 或 打开编辑器
      if (state.swapMode) {
        if (state.swapSourceIdx === -1) {
          state.swapSourceIdx = idx;
          updateEditHint();
          renderGrid();
        } else if (state.swapSourceIdx === idx) {
          state.swapSourceIdx = -1;
          updateEditHint();
          renderGrid();
        } else {
          const preset = getActivePreset();
          const temp = preset.pads[state.swapSourceIdx];
          preset.pads[state.swapSourceIdx] = preset.pads[idx];
          preset.pads[idx] = temp;
          state.swapSourceIdx = -1;
          saveState();
          updateEditHint();
          renderGrid();
          showToast('已互换两个打击垫的位置');
        }
        return;
      }

      // 点击打开编辑抽屉，同时轻触试音方便辨识
      openEditor(idx);
    });

    // 电脑键盘演奏 & 快捷键绑定（使用 e.code，兼容中文输入法）
    window.addEventListener('keydown', function (e) {
      // 1. 正在录入快捷键
      if (state.isBindingKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          state.isBindingKey = false;
          const pad = getEditedPad();
          updateKeyBindButton(pad ? pad.keyCode : '');
          return;
        }
        if (e.code === 'Space') {
          showToast('空格键保留为全局「止音」键，请选择其他按键');
          return;
        }
        const pad = getEditedPad();
        if (pad) {
          const preset = getActivePreset();
          // 若其他键已占用，自动解除旧绑定
          preset.pads.forEach(function (other, i) {
            if (i !== state.editingPadIdx && other.keyCode === e.code) {
              other.keyCode = '';
              showToast('已将快捷键 ' + Presets.formatKeyCode(e.code) + ' 从「' + other.label + '」转移到当前按键');
            }
          });
          pad.keyCode = e.code;
          state.isBindingKey = false;
          saveState();
          updateKeyBindButton(pad.keyCode);
          renderGrid();
        }
        return;
      }

      // 2. 输入框内不拦截键盘
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.code === 'Escape' && state.editingPadIdx >= 0) {
          closeEditor();
        }
        return;
      }

      if (e.code === 'Escape' && state.editingPadIdx >= 0) {
        closeEditor();
        return;
      }

      if (e.repeat) return;

      // 3. 全局空格止音
      if (e.code === 'Space') {
        e.preventDefault();
        Audio.engine.choke('all');
        el.btnChoke.classList.add('active-toggle');
        setTimeout(function () {
          el.btnChoke.classList.remove('active-toggle');
        }, 150);
        return;
      }

      // 4. 演奏模式触发打击垫
      if (!state.editMode && keyCodeToIdx[e.code] !== undefined) {
        e.preventDefault();
        hitPad(keyCodeToIdx[e.code]);
      }
    });

    // 预设切换
    el.presetSelect.addEventListener('change', function () {
      state.activePresetId = el.presetSelect.value;
      closeEditor();
      state.swapSourceIdx = -1;
      saveState();
      renderPresetSelector();
      renderGrid();
    });

    // 另存为新方案
    el.btnNewPreset.addEventListener('click', function () {
      const current = getActivePreset();
      const name = prompt('请输入新打击垫方案名称：', current.name.replace(/ \(副本\)$/, '') + ' (自定义)');
      if (!name || !name.trim()) return;

      const copy = Presets.cloneDeep(current);
      copy.id = 'custom_' + Date.now();
      copy.name = name.trim();
      copy.builtin = false;
      state.presets.push(copy);
      state.activePresetId = copy.id;
      saveState();
      renderPresetSelector();
      renderGrid();
      showToast('已创建方案：' + copy.name);
    });

    // 空间混响切换
    el.reverbBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.reverbMode = btn.dataset.reverb;
        syncSettingsUI();
        saveState();
      });
    });

    // 主音量
    el.masterVolume.addEventListener('input', function () {
      state.settings.masterVolume = Number(el.masterVolume.value);
      Audio.engine.setMasterVolume(state.settings.masterVolume);
      saveState();
    });

    // 止音按钮
    el.btnChoke.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      Audio.engine.choke('all');
    });

    // 编辑模式切换
    el.btnEditMode.addEventListener('click', function () {
      setEditMode(!state.editMode);
    });

    // 行列数调整
    el.btnRowDec.addEventListener('click', function () {
      const p = getActivePreset();
      resizeGrid(p.rows - 1, p.cols);
    });
    el.btnRowInc.addEventListener('click', function () {
      const p = getActivePreset();
      resizeGrid(p.rows + 1, p.cols);
    });
    el.btnColDec.addEventListener('click', function () {
      const p = getActivePreset();
      resizeGrid(p.rows, p.cols - 1);
    });
    el.btnColInc.addEventListener('click', function () {
      const p = getActivePreset();
      resizeGrid(p.rows, p.cols + 1);
    });

    // 互换位置模式
    el.btnSwapMode.addEventListener('click', function () {
      state.swapMode = !state.swapMode;
      state.swapSourceIdx = -1;
      el.btnSwapMode.classList.toggle('active-toggle', state.swapMode);
      el.btnSwapMode.setAttribute('aria-pressed', String(state.swapMode));
      if (state.swapMode) closeEditor();
      updateEditHint();
      renderGrid();
    });

    // 重命名方案
    el.btnRenamePreset.addEventListener('click', function () {
      const preset = getActivePreset();
      const next = prompt('修改方案名称：', preset.name);
      if (!next || !next.trim()) return;
      preset.name = next.trim();
      saveState();
      renderPresetSelector();
      showToast('方案已重命名');
    });

    // 删除自定义方案
    el.btnDeletePreset.addEventListener('click', function () {
      const preset = getActivePreset();
      if (!confirm('确定要删除方案「' + preset.name + '」吗？')) return;
      state.presets = state.presets.filter(function (p) {
        return p.id !== preset.id;
      });
      state.activePresetId = state.presets[0].id;
      closeEditor();
      saveState();
      renderPresetSelector();
      renderGrid();
      showToast('已删除方案');
    });

    // 恢复内置方案默认配置
    el.btnResetPreset.addEventListener('click', function () {
      const preset = getActivePreset();
      const original = Presets.BUILTIN_PRESETS.find(function (b) {
        return b.id === preset.id;
      });
      if (!original) return;
      if (!confirm('确定将「' + preset.name + '」恢复为初始默认布局与音色吗？')) return;
      const idx = state.presets.findIndex(function (p) {
        return p.id === preset.id;
      });
      state.presets[idx] = Presets.cloneDeep(original);
      closeEditor();
      saveState();
      renderPresetSelector();
      renderGrid();
      showToast('已恢复默认布局');
    });

    // 导出 JSON
    el.btnExportJson.addEventListener('click', function () {
      const preset = getActivePreset();
      const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = preset.name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('已导出 JSON 配置文件');
    });

    // 导入 JSON
    el.btnImportJson.addEventListener('click', function () {
      el.importFileInput.value = '';
      el.importFileInput.click();
    });

    el.importFileInput.addEventListener('change', function () {
      const file = el.importFileInput.files && el.importFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(String(reader.result));
          if (!data || !Array.isArray(data.pads) || typeof data.rows !== 'number' || typeof data.cols !== 'number') {
            throw new Error('格式无效');
          }
          const imported = {
            id: 'imported_' + Date.now(),
            name: (data.name || '导入方案') + ' (导入)',
            builtin: false,
            rows: Math.max(2, Math.min(6, Math.round(data.rows))),
            cols: Math.max(2, Math.min(6, Math.round(data.cols))),
            pads: data.pads
          };
          const need = imported.rows * imported.cols;
          while (imported.pads.length < need) {
            imported.pads.push(Presets.createEmptyPad(imported.pads.length));
          }
          imported.pads = imported.pads.slice(0, need);

          state.presets.push(imported);
          state.activePresetId = imported.id;
          closeEditor();
          saveState();
          renderPresetSelector();
          renderGrid();
          showToast('成功导入方案：' + imported.name);
        } catch (_) {
          showToast('导入失败：JSON 配置文件格式不正确');
        }
      };
      reader.readAsText(file);
    });

    // 显示开关
    el.chkShowKeys.addEventListener('change', function () {
      state.settings.showKeys = el.chkShowKeys.checked;
      saveState();
      renderGrid();
    });
    el.chkShowSubs.addEventListener('change', function () {
      state.settings.showSubs = el.chkShowSubs.checked;
      saveState();
      renderGrid();
    });

    // 底部锣鼓经速查开关
    el.btnToggleCheat.addEventListener('click', function () {
      const isHidden = el.cheatSheet.classList.toggle('hidden');
      el.btnToggleCheat.setAttribute('aria-expanded', String(!isHidden));
    });

    // 编辑器字段监听
    el.btnCloseEditor.addEventListener('click', closeEditor);
    el.btnDoneEditor.addEventListener('click', closeEditor);
    el.editorBackdrop.addEventListener('click', closeEditor);

    el.inputPadLabel.addEventListener('input', function () {
      const pad = getEditedPad();
      if (!pad) return;
      pad.label = el.inputPadLabel.value;
      saveState();
      renderGrid();
    });

    el.inputPadSub.addEventListener('input', function () {
      const pad = getEditedPad();
      if (!pad) return;
      pad.sublabel = el.inputPadSub.value;
      saveState();
      renderGrid();
    });

    el.chkPadChoke.addEventListener('change', function () {
      const pad = getEditedPad();
      if (!pad) return;
      pad.chokeOnHit = el.chkPadChoke.checked;
      saveState();
      renderGrid();
    });

    el.btnBindKey.addEventListener('click', function () {
      state.isBindingKey = !state.isBindingKey;
      const pad = getEditedPad();
      updateKeyBindButton(pad ? pad.keyCode : '');
    });

    el.btnClearKey.addEventListener('click', function () {
      const pad = getEditedPad();
      if (!pad) return;
      pad.keyCode = '';
      state.isBindingKey = false;
      saveState();
      updateKeyBindButton('');
      renderGrid();
    });

    el.btnAddLayer.addEventListener('click', function () {
      const pad = getEditedPad();
      if (!pad) return;
      if (!Array.isArray(pad.layers)) pad.layers = [];
      if (pad.layers.length >= 3) return;
      // 智能默认挑选一个尚未添加的常用乐器
      const existing = new Set(pad.layers.map(function (l) { return l.instrument; }));
      const preferred = ['daluo', 'naobo', 'xiaoluo', 'bangu', 'ban', 'datanggu'];
      let nextInst = preferred.find(function (id) { return !existing.has(id); }) || 'bangu';
      pad.layers.push({ instrument: nextInst, volume: 0.9, pitch: 0, delayMs: 0 });
      saveState();
      renderLayersEditor(pad);
      renderGrid();
    });

    el.btnPreviewPad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (state.editingPadIdx >= 0) {
        hitPad(state.editingPadIdx);
      }
    });
  }

  // ======================== 启动初始化 ========================
  function init() {
    loadState();
    syncSettingsUI();
    renderPresetSelector();
    renderCheatSheet();
    renderGrid();
    bindEvents();
  }

  init();
})();
