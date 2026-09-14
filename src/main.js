const gongcheMap = {
  上: '1', 尺: '2', 工: '3', 凡: '4', 六: '5', 五: '6', 乙: '7',
  合: '5', 四: '6', 一: '7', 伍: '6', 亿: '7', 句: '4',
};

const inputText = '哆来咪发唆拉西，拉唆发咪拉西唆西哆';
const state = {
  text: inputText,
  key: 'C',
  tonality: '♩ = 72',
  activeTool: 'free',
  slurMode: false,
  slurs: [],
  pendingSlurStart: null,
  rows: [],
  archiveText: '',
  archiveEditing: false,
  archiveEditable: false,
  scoreRerenderPrompt: 'auto',
  numberedArchiveText: '',
  numberedOverride: null,
  numberedView: 'score',
  lyricReplacing: false,
  viewFlags: { attributes: false, gongche: true, gongcheArchive: false, score: true, scoreArchive: false },
  gongcheView: 'normal',
  previousGongcheView: null,
  paneWidths: { lyric: null, gongche: null, score: null },
  defaultView: true,
  projectCreated: false,
  projectMeta: { title: '未命名曲谱', author: '', mode: '一板一眼' },
  archiveMeta: { version: '1', meter: '2/4', style: '一板一眼', key: 'C' }
};

const history = { undo: [], redo: [], last: '', lastLabel: '当前状态' };
let historyReady = false;
let restoringHistory = false;

const notes = ['上', '尺', '工', '凡', '六', '五', '乙', '合', '四', '伍', '亿', '句'];
const separators = /[，。！？；：、,.!?;:\n]/;
const storageKey = 'gongchepu-editor-state';
const archiveFormat = 'gongchepu';
const maxSlurNesting = 3;
const slurLiftByLevel = { 1: 8, 2: 24, 3: 40 };
const welcomeArchive = `---
format: gongchepu
version: 1
title: 欢迎使用工尺谱编辑器
author: NJU
meter: 2/4
style: 一板一眼
key: C
---

## 歌词

哆来咪发唆拉西，
拉唆发咪拉西唆西哆

## 工尺谱

### 第1句

哆 [上↑@、] [上@]
来 [尺@。]
咪 [工@、。]
发 [凡@-]
唆 [六@<]
拉 [五@]
西 [乙@、。]

### 第2句


拉 [五@、] [√]
唆 [六@]
发 [凡@]
咪 [工@]
拉 [四@。]
西 [一@、。]
唆 [合@-]
西 [一@。]
哆 [上@、。]
`;
const keyboardNotes = {
  shang: '上', chi: '尺', gong: '工', fan: '凡', liu: '六', wu: '五', yi: '乙', si: '四', he: '合', ye: '一'
};
const highInputNotes = new Set(['上', '尺', '工', '凡', '六', '五', '乙']);
const lowInputNotes = new Set(['上', '尺', '工', '凡']);
const keyboardRhythms = {
  '1': '、',
  '2': '。',
  '3': '—',
  '4': '△'
};

function baseGongche(note) {
  return String(note || '').replace(/[↑↓]$/, '');
}

function renderGongcheNote(note) {
  const value = String(note || '');
  const direction = value.match(/[↑↓]$/)?.[0] || '';
  return `${escapeHtml(baseGongche(value))}${direction ? `<sub class="gongche-direction gongche-direction-${direction === '↑' ? 'up' : 'down'}">${direction}</sub>` : ''}`;
}

function gongchePitch(note) {
  return gongcheMap[baseGongche(note)];
}

function gongcheOctave(note) {
  const value = String(note || '');
  return {
    high: value.endsWith('↑'),
    low: lowGongche.has(baseGongche(value)) || value.endsWith('↓')
  };
}

function rhythmBeat(rhythm) {
  if (rhythm === '、' || rhythm === '—') return 0;
  if (rhythm === '。' || rhythm === '○' || rhythm === '△') return 1;
  return null;
}

function buildRows(text) {
  const sentences = text.split(separators).map((sentence) => [...sentence.replace(/\s/g, '')]).filter(Boolean);
  let index = 0;
  return sentences.map((chars, columnIndex) => ({
    id: `column-${columnIndex}`,
    chars: chars.map((char) => {
      const row = {
        id: `${char}-${index}`,
        char,
        notes: [],
        noteRhythms: [],
      };
      index += 1;
      return row;
    })
  }));
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved.text !== 'string' || !Array.isArray(saved.rows)) return false;
    state.text = saved.text;
    state.rows = saved.rows;
    state.archiveText = typeof saved.archiveText === 'string' ? saved.archiveText : '';
    if (typeof saved.archiveEditable === 'boolean') state.archiveEditable = saved.archiveEditable;
    if (typeof saved.scoreRerenderPrompt === 'boolean') state.scoreRerenderPrompt = saved.scoreRerenderPrompt ? 'prompt' : 'off';
    if (['off', 'prompt', 'auto'].includes(saved.scoreRerenderPrompt)) state.scoreRerenderPrompt = saved.scoreRerenderPrompt;
    if (typeof saved.slurMode === 'boolean') state.slurMode = saved.slurMode;
    state.numberedArchiveText = typeof saved.numberedArchiveText === 'string' ? saved.numberedArchiveText : '';
    state.numberedOverride = saved.numberedOverride || null;
    if (state.numberedArchiveText) {
      state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
      state.slurs = state.numberedOverride.slurs || [];
    }
    if (saved.viewFlags && typeof saved.viewFlags === 'object') state.viewFlags = { ...state.viewFlags, ...saved.viewFlags };
    state.gongcheFit = Boolean(saved.gongcheFit);
    if (typeof saved.gongcheView === 'string') state.gongcheView = saved.gongcheView;
    if (typeof saved.previousGongcheView === 'string') state.previousGongcheView = saved.previousGongcheView;
    if (typeof saved.defaultView === 'boolean') state.defaultView = saved.defaultView;
    if (saved.projectMeta && typeof saved.projectMeta === 'object') state.projectMeta = { ...state.projectMeta, ...saved.projectMeta };
    if (saved.archiveMeta && typeof saved.archiveMeta === 'object') state.archiveMeta = { ...state.archiveMeta, ...saved.archiveMeta };
    if (state.archiveText && parseArchiveMeta(state.archiveText).format === archiveFormat) {
      const { gongcheText } = splitCombinedArchive(state.archiveText);
      const meta = parseArchiveMeta(gongcheText);
      state.archiveMeta = { ...state.archiveMeta, ...meta };
    }
    if (Array.isArray(saved.historyUndo)) history.undo = saved.historyUndo.filter((item) => item && typeof item.snapshot === 'string').slice(-50);
    if (Array.isArray(saved.historyRedo)) history.redo = saved.historyRedo.filter((item) => item && typeof item.snapshot === 'string').slice(-50);
    if (saved.paneWidths && typeof saved.paneWidths === 'object') {
      state.paneWidths = { ...state.paneWidths, ...saved.paneWidths };
      if (!state.paneWidths.lyric && saved.paneWidths['lyric-gongche']) state.paneWidths.lyric = saved.paneWidths['lyric-gongche'];
      if (!state.paneWidths.gongche && saved.paneWidths['gongche-score']) state.paneWidths.gongche = saved.paneWidths['gongche-score'];
    }
    return true;
  } catch {
    // Directly opened local files may restrict storage access.
    return false;
  }
}

function saveState(label = '编辑内容') {
  if (!state.archiveEditing) state.archiveText = exportCombinedArchive();
    if (historyReady && !restoringHistory) {
    const current = createStateSnapshot();
    if (current !== history.last) {
      history.undo.push({ snapshot: history.last, label: history.lastLabel });
      if (history.undo.length > 50) history.undo.shift();
      history.redo = [];
      history.last = current;
      history.lastLabel = label;
      updateHistoryButtons();
    }
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify({ text: state.text, rows: state.rows, archiveText: state.archiveText, numberedArchiveText: state.numberedArchiveText, numberedOverride: state.numberedOverride, viewFlags: state.viewFlags, gongcheFit: state.gongcheFit, gongcheView: state.gongcheView, previousGongcheView: state.previousGongcheView, paneWidths: state.paneWidths, defaultView: state.defaultView, projectMeta: state.projectMeta, archiveMeta: state.archiveMeta, archiveEditable: state.archiveEditable, scoreRerenderPrompt: state.scoreRerenderPrompt, slurMode: state.slurMode, historyUndo: history.undo, historyRedo: history.redo }));
  } catch {
    // Keep editing available even when browser storage is unavailable.
  }
}

function saveLabeledState(label) {
  saveState(label);
}

function createStateSnapshot() {
  return JSON.stringify({
    text: state.text,
    rows: state.rows,
    archiveText: state.archiveText,
    numberedArchiveText: state.numberedArchiveText,
    numberedOverride: state.numberedOverride,
    viewFlags: state.viewFlags,
    gongcheFit: state.gongcheFit,
    gongcheView: state.gongcheView,
    previousGongcheView: state.previousGongcheView,
    paneWidths: state.paneWidths,
    activeTool: state.activeTool,
    slurMode: state.slurMode,
    slurs: state.slurs,
    lyricReplacing: state.lyricReplacing,
    projectCreated: state.projectCreated,
    projectMeta: state.projectMeta,
    archiveMeta: state.archiveMeta
  });
}

function restoreStateSnapshot(serialized) {
  const restored = JSON.parse(serialized);
  Object.assign(state, restored);
  state.archiveEditing = false;
  state.archiveMeta = { ...state.archiveMeta, ...(restored.archiveMeta || {}) };
  selectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, totalCharacters() - 1)));
  selectedNoteIndex = 0;
  input.value = state.text;
  restoringHistory = true;
   saveState();
  restoringHistory = false;
  renderBoard();
  syncViewFlags();
  syncToolButtons();
  syncNotationMenu();
  applyPaneWidths();
  document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
}

function updateHistoryButtons() {
  const undo = document.querySelector('[data-action="undo"]');
  const redo = document.querySelector('[data-action="redo"]');
  undo?.toggleAttribute('disabled', history.undo.length === 0);
  redo?.toggleAttribute('disabled', history.redo.length === 0);
  if (undo) undo.title = history.undo.length ? `撤回${history.undo.at(-1).label}` : '没有可撤回的操作';
  if (redo) redo.title = history.redo.length ? `恢复${history.redo.at(-1).label}` : '没有可恢复的操作';
  const dropdown = document.querySelector('[data-history-dropdown]');
  if (dropdown && !dropdown.hidden) renderHistoryMenu();
}

function renderHistoryMenu() {
  const dropdown = document.querySelector('[data-history-dropdown]');
  if (!dropdown) return;
  const items = history.undo.slice(-5).reverse();
  dropdown.innerHTML = items.length
    ? items.map((item) => `<span class="history-item">${escapeHtml(item.label)}</span>`).join('')
    : '<span class="history-empty">没有可撤回的操作</span>';
}

function undoState() {
  if (!history.undo.length) return showToast('没有可撤回的操作');
  const current = createStateSnapshot();
  history.redo.push({ snapshot: current, label: history.lastLabel });
  const previous = history.undo.pop();
  history.last = previous.snapshot;
  history.lastLabel = previous.label;
  restoreStateSnapshot(previous.snapshot);
  updateHistoryButtons();
  showToast('已撤回');
}

function redoState() {
  if (!history.redo.length) return showToast('没有可恢复的操作');
  const current = createStateSnapshot();
  history.undo.push({ snapshot: current, label: history.lastLabel });
  const next = history.redo.pop();
  history.last = next.snapshot;
  history.lastLabel = next.label;
  restoreStateSnapshot(next.snapshot);
  updateHistoryButtons();
  showToast('已恢复');
}

state.rows = buildRows(state.text);
const hasSavedState = loadSavedState();
if (!hasSavedState) {
  state.archiveText = welcomeArchive;
  state.rows = parseArchive(welcomeArchive);
  state.text = parseArchiveLyrics(welcomeArchive);
  state.projectMeta = { title: '欢迎使用工尺谱编辑器', author: 'NJU', mode: '一板一眼' };
  state.archiveMeta = { version: '1', meter: '2/4', style: '一板一眼', key: 'C' };
}
state.rows.forEach((column) => column.chars.forEach((row) => {
  if (!Array.isArray(row.notes)) row.notes = [];
  if (!Array.isArray(row.noteRhythms)) {
    const oldRhythms = Array.isArray(row.rhythms) ? row.rhythms.slice(0, 2) : [];
    row.noteRhythms = row.notes.map(() => []);
    if (row.noteRhythms.length) row.noteRhythms[0] = oldRhythms;
    delete row.rhythms;
  }
  while (row.noteRhythms.length < row.notes.length) row.noteRhythms.push([]);
  row.noteRhythms = row.noteRhythms.slice(0, row.notes.length).map((rhythms) => Array.isArray(rhythms) ? rhythms.slice(0, 3) : []);
}));
saveState();
let selectedIndex = 0;
let selectedNoteIndex = 0;
let keyboardBuffer = '';
let keyboardTimer;
let shiftHeld = false;
let capsLockHeld = false;

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">尺</div>
        <div><div class="brand-title">工尺谱 · 新编</div><div class="brand-subtitle">古谱今译，心声可见</div></div>
      </div>
       <div class="view-menus">
         <div class="view-menu-wrap"><button class="view-menu-button" data-action="file-menu">文件</button><div class="view-dropdown file-dropdown" hidden><button data-action="archive-upload">导入存档</button><button data-action="export">导出存档</button><button data-action="new-project">新建曲谱</button></div></div>
         <div class="view-menu-wrap"><button class="view-menu-button" data-action="view-menu">视图</button><div class="view-dropdown view-dropdown-list" hidden><button data-view="defaultView"><span>默认视图</span><b>✓</b></button><div class="view-divider"></div><button data-view="attributes"><span>属性视图</span><b>✓</b></button><div class="view-divider"></div><button data-action="gongche-view" data-gongche-view="normal"><span>工尺谱视图</span><b></b></button><button data-action="gongche-view" data-gongche-view="fit"><span>工尺谱自适应视图</span><b></b></button><button data-action="gongche-view" data-gongche-view="single"><span>工尺谱单字视图</span><b></b></button><button data-view="gongcheArchive"><span>工尺存档视图</span><b>✓</b></button><div class="view-divider"></div><button data-view="score"><span>简谱视图</span><b>✓</b></button><button data-view="scoreArchive"><span>简谱存档视图</span><b>✓</b></button></div></div>
         <div class="view-menu-wrap"><button class="view-menu-button" data-action="notation-menu">打谱</button><div class="view-dropdown" hidden><button data-action="preview-mode"><span>预览模式</span><b></b></button><div class="view-divider"></div><button data-action="replace-lyric"><span>替换歌词</span><b></b></button><button data-action="note-mode"><span>输入音符</span><b></b></button><button data-action="rhythm-mode"><span>输入节奏</span><b></b></button></div></div>
         <div class="view-menu-wrap"><button class="view-menu-button" data-action="translation-menu">译谱</button><div class="view-dropdown" hidden><button data-action="convert">转写简谱</button><button data-action="slur-mode" data-translation-slur>连音绘制</button></div></div>
       </div>
       <div class="current-mode" aria-live="polite"><span class="project-meta" data-project-meta="title" contenteditable="false" title="点击编辑曲名">${escapeHtml(state.projectMeta.title || '未命名曲谱')}</span><span class="project-meta-separator"> · </span><span class="project-meta" data-project-meta="author" contenteditable="false" title="点击编辑作者">${escapeHtml(state.projectMeta.author || '未署名')}</span><span class="current-mode-label">当前模式：<strong id="current-mode-label">预览模式</strong></span></div>
         <div class="header-actions">
         <div class="command-group"><span class="history-control"><button class="mini-button" data-action="undo" title="撤回">↶</button><button class="history-toggle" data-action="history-menu" aria-label="打开撤回菜单">▾</button><div class="history-dropdown" data-history-dropdown hidden></div></span><button class="mini-button" data-action="redo" title="恢复">↷</button></div>
          <div class="archive-header-actions"><button class="settings-button" data-action="settings" aria-label="打开设置" title="设置">⚙</button><div class="settings-dropdown view-dropdown" data-settings-dropdown hidden><label class="settings-toggle"><span>存档可编辑</span><input type="checkbox" data-setting="archiveEditable"><i></i></label><label class="settings-select"><span>重渲染设置</span><select data-setting="scoreRerenderPrompt"><option value="off">关</option><option value="prompt">提示</option><option value="auto">自动</option></select></label><button data-action="tutorial">教程</button><div class="view-divider"></div><footer>南京大学 · ButterJack 开发</footer></div></div>
        </div>
    </header>
    <div class="tutorial-backdrop" id="tutorial-backdrop" hidden>
      <section class="tutorial-card" role="dialog" aria-modal="true" aria-label="使用教程">
        <button class="tutorial-close" data-action="tutorial-close" aria-label="关闭教程">×</button>
        <div class="tutorial-kicker">QUICK START</div>
        <h2>三步完成一份曲谱</h2>
        <p class="tutorial-lead">从歌词开始，先编排工尺谱，再生成独立的简谱存档。</p>
        <div class="tutorial-steps">
          <div><b>01</b><strong>输入歌词</strong><span>在第一部分输入歌词。</span></div>
          <div><b>02</b><strong>输入工尺</strong><span>选择“输入音符”，点击字框后录入工尺字符。<button class="tutorial-detail" data-action="tutorial-notes">查看输入法则</button></span></div>
          <div><b>03</b><strong>输入节奏</strong><span>选择“输入节奏”，点击工尺字符后录入节奏。<button class="tutorial-detail" data-action="tutorial-rhythms">查看输入法则</button></span></div>
          <div><b>04</b><strong>生成简谱</strong><span>点击“转写简谱”，模块三会根据简谱存档显示结果。</span></div>
        </div>
        <div class="tutorial-detail-panel" id="tutorial-detail-panel" hidden></div>
         <div class="tutorial-note">提示：工尺存档是源数据；简谱存档可以独立微调，不会反向修改工尺谱。</div>
      </section>
    </div>
    <div class="project-backdrop" id="project-backdrop" hidden>
      <section class="project-card" role="dialog" aria-modal="true" aria-label="新建曲谱">
        <button class="tutorial-close" data-action="project-close" aria-label="关闭">×</button>
        <div class="tutorial-kicker">NEW SCORE</div>
        <div class="project-step-indicator"><b class="active">01</b><i></i><b>02</b></div>
        <section class="project-page" data-project-page="1">
          <h2>新建曲谱</h2><p class="tutorial-lead">先填写曲谱基本信息。</p>
          <label class="project-field">曲谱名称<input id="project-title" value="未命名曲谱" /></label>
          <label class="project-field">作者（可选）<input id="project-author" /></label>
          <label class="project-field">模式<select id="project-mode"><option>一板一眼</option></select></label>
          <button class="project-next" data-action="project-next">下一步</button>
        </section>
        <section class="project-page" data-project-page="2" hidden>
          <h2>输入歌词</h2><p class="tutorial-lead">歌词确定后将不能再整体修改，只能使用“替换歌词”逐字替换。</p>
          <textarea id="project-lyrics" class="project-lyrics" placeholder="请输入歌词"></textarea>
          <button class="project-next" data-action="project-create">创建曲谱</button>
        </section>
      </section>
    </div>
    <div class="rerender-backdrop" id="rerender-backdrop" hidden><section class="rerender-card" role="dialog" aria-modal="true" aria-label="重新渲染简谱"><p class="rerender-kicker">SCORE LAYOUT</p><h2>简谱宽度已变化</h2><p>重新渲染可根据当前模块宽度调整简谱换行与连音线位置。</p><label class="rerender-ignore"><input type="checkbox" id="rerender-ignore" /> 忽略此类提示</label><div class="rerender-actions"><button data-action="rerender-cancel">保持当前排版</button><button data-action="rerender-confirm">重新渲染</button></div></section></div>

    <main class="page">
      <section class="editor-card">
        <div class="workspace-panes" id="workspace-panes">
          <section class="workspace-pane lyric-pane" data-pane="lyric">
            <div class="pane-title"><strong>歌词属性</strong><div class="text-tools"><span id="char-count">${[...state.text].length} 字</span></div></div>
            <div class="lyric-attributes" id="lyric-attributes"></div>
            <input id="lyric-input" class="lyric-replacement-input" spellcheck="false" aria-label="替换歌词" placeholder="点选字后替换" disabled />
          </section>
          <div class="pane-divider" data-divider="lyric-gongche" role="separator" aria-label="调整歌词和工尺谱宽度"></div>
          <section class="workspace-pane gongche-pane" data-pane="gongche">
      <div class="pane-title"><strong>编排工尺谱</strong></div>
            <section class="archive-panel" id="archive-panel" hidden>
              <div class="archive-toolbar"><span>Gongche Markdown · 编辑后点击保存修改</span><button class="archive-small-button" data-action="archive-import">保存修改</button></div>
              <textarea id="archive-editor" spellcheck="false" aria-label="Gongche Markdown 存档编辑器"></textarea>
              <p class="archive-hint">像 LaTeX 一样编辑存档；每个工尺最多三个节奏，格式错误会保留在编辑器中。</p>
            </section>
            <input id="archive-file-input" type="file" accept=".txt,text/plain" hidden />
            <div class="notation-board" id="notation-board"></div>
          </section>
          <div class="pane-divider" data-divider="gongche-score" role="separator" aria-label="调整工尺谱和简谱宽度"></div>
  <section class="workspace-pane score-pane" data-pane="score">
            <div class="score-preview" id="score-preview" hidden></div>
          </section>
        </div>
      </section>
    </main>
    <div class="toast" id="toast"></div>
  </div>
`;

const board = document.querySelector('#notation-board');
const input = document.querySelector('#lyric-input');
const toast = document.querySelector('#toast');
const convertButton = document.querySelector('[data-action="convert"]');
const archivePanel = document.querySelector('#archive-panel');
const archiveEditor = document.querySelector('#archive-editor');
const archiveFileInput = document.querySelector('#archive-file-input');
const tutorialBackdrop = document.querySelector('#tutorial-backdrop');
const tutorialDetailPanel = document.querySelector('#tutorial-detail-panel');
const projectBackdrop = document.querySelector('#project-backdrop');
const rerenderBackdrop = document.querySelector('#rerender-backdrop');
const lyricAttributes = document.querySelector('#lyric-attributes');
const workspacePanes = document.querySelector('#workspace-panes');
let numberedArchivePanel = null;
let numberedArchiveEditor = null;

function syncViewFlags() {
  if (state.viewFlags.gongcheArchive) {
    state.viewFlags.gongche = false;
    state.gongcheView = 'archive';
  }
  const lyricPane = document.querySelector('[data-pane="lyric"]');
  const gongchePane = document.querySelector('[data-pane="gongche"]');
  const scorePane = document.querySelector('[data-pane="score"]');
  const showGongche = state.viewFlags.gongche || state.viewFlags.gongcheArchive;
  const showScore = state.viewFlags.score || state.viewFlags.scoreArchive;
  lyricPane.hidden = !state.viewFlags.attributes;
  gongchePane.hidden = !showGongche;
  scorePane.hidden = !showScore;
  if (showScore) renderScore();
  document.querySelector('[data-divider="lyric-gongche"]').hidden = !state.viewFlags.attributes || !showGongche;
  document.querySelector('[data-divider="gongche-score"]').hidden = !showGongche || !showScore;
  archivePanel.hidden = !state.viewFlags.gongcheArchive;
  board.hidden = state.viewFlags.gongcheArchive;
  document.querySelector('.notation-footer')?.toggleAttribute('hidden', state.viewFlags.gongcheArchive);
  document.querySelectorAll('[data-view]').forEach((button) => {
    const archiveView = button.dataset.view === 'gongcheArchive' || button.dataset.view === 'scoreArchive';
    button.disabled = archiveView && !state.archiveEditable;
    button.classList.toggle('disabled', button.disabled);
    const checked = button.dataset.view === 'defaultView' ? state.defaultView : Boolean(state.viewFlags[button.dataset.view]);
    button.classList.toggle('checked', checked);
    button.querySelector('b').textContent = checked ? '✓' : '';
  });
  board.classList.toggle('fit-enabled', Boolean(state.gongcheFit));
  document.querySelectorAll('[data-gongche-view]').forEach((button) => {
    const checked = state.viewFlags.gongche && state.gongcheView === button.dataset.gongcheView;
    button.classList.toggle('checked', checked);
    button.querySelector('b').textContent = checked ? '✓' : '';
  });
  const archiveToggle = document.querySelector('[data-setting="archiveEditable"]');
  if (archiveToggle) archiveToggle.checked = state.archiveEditable;
  const rerenderToggle = document.querySelector('[data-setting="scoreRerenderPrompt"]');
  if (rerenderToggle) rerenderToggle.value = state.scoreRerenderPrompt;
}

let scorePaneWidth = 0;
function requestScoreRerender() {
  if (state.scoreRerenderPrompt === 'auto') {
    renderScore();
    return;
  }
  if (state.scoreRerenderPrompt !== 'prompt' || !state.viewFlags.score || state.viewFlags.scoreArchive || !state.numberedOverride) return;
  rerenderBackdrop.hidden = false;
}

new ResizeObserver((entries) => {
  const width = Math.round(entries[0].contentRect.width);
  if (!scorePaneWidth) { scorePaneWidth = width; return; }
  if (Math.abs(width - scorePaneWidth) > 2) requestScoreRerender();
  scorePaneWidth = width;
}).observe(document.querySelector('[data-pane="score"]'));

function refreshVisibleViews() {
  syncViewFlags();
  renderBoard();
  renderScore();
  requestAnimationFrame(() => {
    applyPaneWidths();
    fitGongcheBoard();
    markScoreRowEnds();
  });
}

function syncNotationMenu() {
  const activeAction = state.slurMode ? 'slur-mode' : state.lyricReplacing ? 'replace-lyric' : state.activeTool === 'note' ? 'note-mode' : state.activeTool === 'rhythm' ? 'rhythm-mode' : 'preview-mode';
  const modeLabel = state.slurMode ? '连音绘制' : state.lyricReplacing ? '替换歌词' : state.activeTool === 'note' ? '输入音符' : state.activeTool === 'rhythm' ? '输入节奏' : '预览模式';
  const currentModeLabel = document.querySelector('#current-mode-label');
  if (currentModeLabel) currentModeLabel.textContent = modeLabel;
  ['preview-mode', 'replace-lyric', 'note-mode', 'rhythm-mode', 'slur-mode'].forEach((action) => {
    const button = document.querySelector(`[data-action="${action}"]`);
    if (!button) return;
    const checked = action !== 'preview-mode' && action === activeAction;
    button.classList.toggle('checked', checked);
    button.querySelector('b').textContent = checked ? '✓' : '';
  });
}

function closeMenus() {
  document.querySelectorAll('.view-dropdown').forEach((menu) => { menu.hidden = true; });
}

function applyPaneWidths() {
  const panes = [...document.querySelectorAll('[data-pane]')].filter((pane) => !pane.hidden);
  if (!panes.length) return;
  const available = workspacePanes.clientWidth;
  const dividerWidth = [...document.querySelectorAll('[data-divider]')]
    .filter((divider) => !divider.hidden)
    .reduce((total, divider) => total + divider.getBoundingClientRect().width, 0);
  const minimums = { lyric: 180, gongche: Math.max(300, window.innerWidth * 0.25), score: Math.max(300, window.innerWidth * 0.4) };
  const widths = panes.map((pane) => ({
    pane,
    key: pane.dataset.pane,
    width: Number(state.paneWidths?.[pane.dataset.pane]) || pane.getBoundingClientRect().width,
    minimum: minimums[pane.dataset.pane] || 180
  }));
  const usable = Math.max(0, available - dividerWidth);
  const minimumTotal = widths.reduce((total, item) => total + item.minimum, 0);
  const targetTotal = Math.max(usable, minimumTotal);
  const savedTotal = widths.reduce((total, item) => total + item.width, 0);
  const scale = savedTotal > targetTotal ? (targetTotal - minimumTotal) / Math.max(1, savedTotal - minimumTotal) : 1;
  widths.forEach(({ pane, key, width, minimum }, index) => {
    if (index === widths.length - 1) {
      pane.style.flex = '1 1 auto';
      return;
    }
    const nextWidth = Math.max(minimum, minimum + (width - minimum) * scale);
    pane.style.flex = `0 0 ${Math.round(nextWidth)}px`;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function syncProjectMetaDisplay() {
  const title = document.querySelector('[data-project-meta="title"]');
  const author = document.querySelector('[data-project-meta="author"]');
  if (title) title.textContent = state.projectMeta.title || '未命名曲谱';
  if (author) author.textContent = state.projectMeta.author || '未署名';
}

function saveProjectMetaField(field, element) {
  const value = element.textContent.trim();
  state.projectMeta[field] = value;
  element.textContent = value || (field === 'title' ? '未命名曲谱' : '未署名');
  state.archiveEditing = true;
  saveState(field === 'title' ? (value ? '修改曲名' : '删除曲名') : (value ? '修改作者名' : '删除作者名'));
  state.archiveEditing = false;
  state.archiveText = exportArchive();
  if (archiveEditor && state.viewFlags.gongcheArchive) archiveEditor.value = state.archiveText;
  showToast(`${field === 'title' ? '曲名' : '作者名'}已更新`);
}

function applyDefaultPaneWidths() {
  const panes = [...document.querySelectorAll('[data-pane]')].filter((pane) => !pane.hidden);
  const dividers = [...document.querySelectorAll('[data-divider]')].filter((divider) => !divider.hidden);
  const available = workspacePanes.clientWidth;
  const dividerWidth = dividers.reduce((total, divider) => total + divider.getBoundingClientRect().width, 0);
  const usable = Math.max(0, available - dividerWidth);
  const widths = [usable / 6, usable / 3, usable / 2];
  panes.forEach((pane, index) => {
    const width = widths[index];
    if (!Number.isFinite(width) || width <= 0) return;
    pane.style.flex = `0 0 ${Math.round(width)}px`;
    state.paneWidths[pane.dataset.pane] = Math.round(width);
  });
}

function clearDefaultView() {
  if (!state.defaultView) return;
  state.defaultView = false;
  syncViewFlags();
}

function setDefaultView() {
  state.defaultView = true;
  state.viewFlags = { ...state.viewFlags, attributes: true, gongche: true, gongcheArchive: false, score: true, scoreArchive: false };
  state.gongcheView = 'fit';
  state.gongcheFit = true;
  state.activeTool = null;
  state.lyricReplacing = false;
  syncViewFlags();
  applyDefaultPaneWidths();
  renderBoard();
  renderScore();
  syncToolButtons();
  syncNotationMenu();
  saveState();
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-pane]').forEach((pane) => {
      if (!pane.hidden) state.paneWidths[pane.dataset.pane] = Math.round(pane.getBoundingClientRect().width);
    });
    saveState('应用默认视图');
  });
}

function setPaneWidth(pane, width) {
  pane.style.flex = `0 0 ${Math.round(width)}px`;
}

document.querySelectorAll('[data-divider]').forEach((divider) => {
  divider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    clearDefaultView();
    divider.classList.add('dragging');
    const startX = event.clientX;
    const leftPane = divider.previousElementSibling;
    const rightPane = divider.nextElementSibling;
    const startLeft = leftPane.getBoundingClientRect().width;
    const startRight = rightPane.getBoundingClientRect().width;
    const rightMinimum = Math.max(300, rightPane.dataset.pane === 'score' ? window.innerWidth * 0.4 : 0);
    const leftMinimum = leftPane.dataset.pane === 'lyric' ? 180 : Math.max(300, window.innerWidth * 0.25);
    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextLeft = Math.max(leftMinimum, Math.min(startLeft + delta, startLeft + startRight - rightMinimum));
      const nextRight = Math.max(rightMinimum, startRight - (nextLeft - startLeft));
      setPaneWidth(leftPane, nextLeft);
      setPaneWidth(rightPane, nextRight);
    };
    const stop = () => {
      divider.classList.remove('dragging');
      document.querySelectorAll('[data-pane]').forEach((pane) => {
        if (!pane.hidden) state.paneWidths[pane.dataset.pane] = Math.round(pane.getBoundingClientRect().width);
      });
      saveState();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });
});

function ensureWorkspaceDefaults() {
  if (!state.rows.length) state.rows = buildRows(state.text);
  input.value = state.text;
  renderBoard();
  document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function renderLyricAttributes() {
  if (!lyricAttributes) return;
  const row = getCharacterAt(selectedIndex);
  if (!row) {
    lyricAttributes.innerHTML = '<div class="attribute-empty">点选 02 工尺谱中的歌词字，即可查看和修改属性。</div>';
    return;
  }
  lyricAttributes.innerHTML = `
    <div class="attribute-preview">
      <span class="attribute-caption">当前唱字</span>
      <strong>${row.char || '□'}</strong>
      <small>${row.notes.length ? `${row.notes.length} 个工尺` : '尚未录入工尺'}</small>
    </div>
    <label class="attribute-field">歌词字<input data-attribute-char value="${row.char || ''}" maxlength="1" /></label>
    <div class="attribute-section"><span>工尺与节奏</span>${row.notes.length ? row.notes.map((note, noteIndex) => `
      <div class="attribute-note-row">
        <code>[${note}@${(row.noteRhythms[noteIndex] || []).map((rhythm) => rhythm === '△' ? '<' : rhythm === '—' ? '-' : rhythm).join('')}]</code>
      </div>
    `).join('') : '<i class="attribute-empty-note">在“输入音符”模式录入工尺</i>'}</div>
  `;
}

function escapeArchiveChar(char) {
  return char === ' ' ? '\\s' : char;
}

function unescapeArchiveChar(char) {
  return char === '\\s' ? ' ' : char;
}

function exportArchive() {
  const lines = [
    '---',
    `format: ${archiveFormat}`,
    `version: ${state.archiveMeta.version || '1'}`,
    `title: ${state.projectMeta.title || '未命名曲谱'}`,
    `author: ${state.projectMeta.author || ''}`,
    `meter: ${state.archiveMeta.meter || '2/4'}`,
    `style: ${state.archiveMeta.style || state.projectMeta.mode || '一板一眼'}`,
    `key: ${state.archiveMeta.key || 'C'}`,
    '---',
    '',
    '## 歌词',
    '',
    state.text,
    '',
    '## 工尺谱',
    ''
  ];
  let sentenceIndex = 0;
  state.rows.forEach((column) => {
    sentenceIndex += 1;
    lines.push(`### 第${sentenceIndex}句`, '');
    column.chars.forEach((row) => {
        const marks = row.notes.map((note, noteIndex) => {
        if (note === '√') return '[√]';
        const rhythms = row.noteRhythms[noteIndex] || [];
        const archiveRhythms = rhythms.map((rhythm) => rhythm === '△' ? '<' : rhythm === '—' ? '-' : rhythm).join('');
        return `[${note}@${archiveRhythms}]`;
      });
      lines.push(`${escapeArchiveChar(row.char)} ${marks.join(' ')}`.trim());
    });
    lines.push('');
  });
  return lines.join('\n');
}

function exportCombinedArchive() {
  const gongcheText = exportArchive();
  const numberedText = state.numberedArchiveText || (state.numberedOverride ? exportNumberedArchive(state.numberedOverride) : '');
  return numberedText ? `${gongcheText.trim()}\n\n${numberedText.trim()}\n` : gongcheText;
}

function getArchiveForDownload() {
  return exportCombinedArchive();
}

function numberedValue(note) {
  return note.number || '—';
}

function numberedArchiveValue(note) {
  const number = numberedValue(note);
  if (note.high) return `^${number}`;
  if (note.low || lowGongche.has(note.gongche)) return `_${number}`;
  return number;
}

function exportNumberedArchive(bars) {
  const lines = ['---', 'format: numbered-notation', 'version: 1', 'meter: 2/4', 'source: gongchepu', '---', '', '## 简谱', ''];
  bars.forEach((bar, index) => {
    const printBeat = (groups, beatKey) => {
      let notePosition = 0;
      return groups.flatMap((group) => group.notes.map((note) => {
      const lyric = note.lyric !== undefined ? note.lyric : '';
      const graceMarks = note.graces?.length ? '√'.repeat(note.graces.length) : '';
      const key = `${index}:${beatKey}:${notePosition++}`;
      const opens = (state.slurs || []).filter((slur) => slur.start === key).sort((a, b) => slurPosition(b.end) - slurPosition(a.end)).map(() => '(');
      const closes = (state.slurs || []).filter((slur) => slur.end === key).sort((a, b) => slurPosition(b.start) - slurPosition(a.start)).map(() => ')');
      return [...opens, `${numberedArchiveValue(note)}${graceMarks}{${lyric}}`, ...closes].join(' ');
      })).join(' ');
    };
    lines.push(`### 小节${index + 1}`, `第一拍: ${printBeat(bar.first, 'first')}`, `第二拍: ${printBeat(bar.second, 'second')}`, '');
  });
  return lines.join('\n');
}

function assignNumberedLyrics(bars) {
  const occurrences = new Map();
  bars.forEach((bar) => ['first', 'second'].forEach((beat) => {
    bar[beat].forEach((group) => group.notes.forEach((note) => {
      note.lyric = '';
      const sourceRowId = note.sourceRowId || group.rowId;
      if (!occurrences.has(sourceRowId)) occurrences.set(sourceRowId, []);
      occurrences.get(sourceRowId).push(note);
    }));
  }));

  occurrences.forEach((notes) => {
    const anchor = notes.find((note) => note.frontExtension) || notes[0];
    if (anchor) anchor.lyric = anchor.sourceChar || anchor.char || '';
  });
}

function parseNumberedArchive(source) {
  if (!source.includes('format: numbered-notation')) throw new Error('不是简谱存档格式');
  if (!/^---\s*\n[\s\S]*?^format:\s*numbered-notation\s*$[\s\S]*?^---\s*$/m.test(source.trim())) throw new Error('简谱存档缺少有效文件头');
  const bars = [];
  let bar = null;
  const slurStack = [];
  const slurs = [];
  let lastNoteKey = null;
  source.split('\n').forEach((line, lineIndex) => {
    if (/^###\s+小节/.test(line)) { bar = { first: [], second: [] }; bars.push(bar); return; }
    const match = line.match(/^(第一拍|第二拍):\s*(.*)$/);
    if (!match || !bar) return;
    const groups = [];
    const tokens = match[2].match(/[^\s]+/g) || [];
    tokens.forEach((token) => {
      if (token === '(') {
        if (slurStack.length >= maxSlurNesting) throw new Error(`第 ${lineIndex + 1} 行连音线最多嵌套 ${maxSlurNesting} 层`);
        slurStack.push(null);
        return;
      }
      if (token === ')') {
        const start = slurStack.pop();
        if (!start) throw new Error(`第 ${lineIndex + 1} 行存在空或未起始的连音线`);
        if (!lastNoteKey || start === lastNoteKey) throw new Error(`第 ${lineIndex + 1} 行连音线必须连接至少两个音符`);
        slurs.push({ id: `slur-${slurs.length + 1}`, start, end: lastNoteKey });
        return;
      }
      const tokenMatch = token.match(/^([^{}]+)\{(.*)\}(?:\/d([12]))?$/);
      if (!tokenMatch) throw new Error(`无法解析第 ${lineIndex + 1} 行：${line}`);
      const rawNumber = tokenMatch ? tokenMatch[1] : token;
      const high = rawNumber.startsWith('^');
      const low = rawNumber.startsWith('_');
      const graceCount = [...rawNumber].filter((char) => char === '√').length;
      const number = rawNumber.replace(/^[_^]+/, '').replace(/√/g, '');
      const char = tokenMatch ? tokenMatch[2] : '';
      const notePosition = groups.length;
      const noteKey = `${bars.length - 1}:${match[1] === '第一拍' ? 'first' : 'second'}:${notePosition}`;
      slurStack.forEach((start, index) => { if (!start) slurStack[index] = noteKey; });
      lastNoteKey = noteKey;
      groups.push({ char, rowId: `numbered-${bars.length}-${match[1]}-${groups.length}`, notes: [{ number, high, low, gongche: number, char, lyric: char, graces: Array(graceCount).fill('√'), isSubdivision: false }] });
    });
    bar[match[1] === '第一拍' ? 'first' : 'second'] = groups;
  });
  if (!bars.length) throw new Error('简谱存档没有小节');
  if (slurStack.length) throw new Error('存在未闭合的连音线');
  bars.slurs = slurs;
  return bars;
}

function extractNumberedArchive(source) {
  return splitCombinedArchive(source).numberedText;
}

function splitCombinedArchive(source) {
  const normalized = source.replace(/\r\n/g, '\n').trim();
  const marker = '\n---\nformat: numbered-notation';
  const numberedIndex = normalized.indexOf(marker);
  if (numberedIndex < 0) {
    return { gongcheText: normalized, numberedText: '' };
  }
  return {
    gongcheText: normalized.slice(0, numberedIndex).trim(),
    numberedText: normalized.slice(numberedIndex + 1).trim()
  };
}

function prepareNumberedBarsForView(bars) {
  return bars.map((bar) => {
    // An empty lyric is still a real note slot. Never merge it into the
    // preceding lyric group: the archive already contains the final layout.
    const copyBeat = (groups) => groups.map((group) => ({
      ...group,
      notes: group.notes.map((note) => ({ ...note }))
    }));
    return { first: copyBeat(bar.first), second: copyBeat(bar.second) };
  });
}

function saveNumberedArchive() {
  if (!numberedArchiveEditor) return;
  try {
    state.numberedOverride = parseNumberedArchive(numberedArchiveEditor.value);
    state.slurs = state.numberedOverride.slurs || [];
    state.numberedArchiveText = numberedArchiveEditor.value;
    saveState('保存简谱存档');
    renderScore();
    if (numberedArchivePanel) numberedArchivePanel.hidden = false;
    showToast('简谱存档已保存');
  } catch (error) { showToast(error.message || '简谱存档格式有误'); }
}

function syncArchiveFromState() {
  if (state.archiveEditing) return;
  state.archiveText = exportCombinedArchive();
  if (archiveEditor) archiveEditor.value = state.archiveText;
}

function parseArchive(source) {
  const trimmedSource = source.trim();
  if (!/^---\s*\n[\s\S]*?^format:\s*gongchepu\s*$[\s\S]*?^---\s*$/m.test(trimmedSource)) throw new Error('工尺存档缺少有效文件头');
  if (!/^##\s+歌词\s*$/m.test(source)) throw new Error('缺少“## 歌词”段落');
  const notationStart = source.indexOf('## 工尺谱');
  if (notationStart < 0) throw new Error('缺少“## 工尺谱”段落');
  const numberedStart = source.indexOf('## 简谱', notationStart);
  const notation = source.slice(notationStart, numberedStart < 0 ? source.length : numberedStart).split('\n');
  const columns = [];
  let column = null;
  let columnIndex = -1;
  notation.forEach((line, lineIndex) => {
    if (/^### /.test(line)) {
      column = { chars: [] };
      columns.push(column);
      columnIndex += 1;
      return;
    }
    if (!column || !line.trim() || line.trim().startsWith('##')) return;
    const match = line.match(/^(.*?)\s*((?:\[[^\]]*\]\s*)*)$/);
    if (!match) throw new Error(`无法解析：${line}`);
    const char = unescapeArchiveChar(match[1].trim());
    const tokenSource = match[2].trim();
    const notes = [];
    const noteRhythms = [];
    const tokenPattern = /\[([^@\]]+)(?:@([^\]]*))?\]/g;
    const matchedTokens = [];
    let token;
    while ((token = tokenPattern.exec(tokenSource))) {
      matchedTokens.push(token[0]);
      const note = token[1];
      if (note === '√') {
        notes.push(note);
        noteRhythms.push([]);
        continue;
      }
      const rhythms = [...(token[2] || '')].map((rhythm) => rhythm === '<' ? '△' : rhythm === '-' ? '—' : rhythm);
      if (rhythms.length > 3) throw new Error(`一个工尺最多只能有三个节奏：${line}`);
      notes.push(note);
      noteRhythms.push(rhythms);
    }
    if (matchedTokens.join('') !== tokenSource.replace(/\s+/g, '')) throw new Error(`无法解析第 ${lineIndex + 1} 行：${line}`);
    column.chars.push({ id: `archive-${columnIndex}-${column.chars.length}-${char}`, char, notes, noteRhythms });
  });
  if (!columns.length) throw new Error('没有找到可用的工尺谱内容');
  return columns;
}

function parseArchiveLyrics(source) {
  const lyricsStart = source.indexOf('## 歌词');
  if (lyricsStart < 0) return '';
  const lyricsBody = source.slice(lyricsStart + '## 歌词'.length);
  const sectionEnd = lyricsBody.indexOf('## 工尺谱');
  const section = sectionEnd < 0 ? lyricsBody : lyricsBody.slice(0, sectionEnd);
  return section
    .replace(/\r/g, '')
    .replace(/^\s*\n/, '')
    .replace(/\n\s*$/, '')
    .replace(/---\s*format:\s*numbered-notation[\s\S]*$/i, '')
    .trim();
}

function parseArchiveMeta(source) {
  const header = source.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!header) return {};
  return header[1].split('\n').reduce((meta, line) => {
    const match = line.match(/^([a-z]+):\s*(.*)$/i);
    if (match) meta[match[1].toLowerCase()] = match[2].trim();
    return meta;
  }, {});
}

function applyArchive(showMessage = false) {
  try {
    const source = archiveEditor.value.replace(/\r\n/g, '\n').trim();
    const { gongcheText, numberedText } = splitCombinedArchive(source);
    const firstArchiveFormat = parseArchiveMeta(source).format;
    if (firstArchiveFormat === 'numbered-notation') {
      state.numberedArchiveText = source;
      state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
      state.slurs = state.numberedOverride.slurs || [];
      saveState('导入简谱存档');
      renderScore();
      if (showMessage) showToast('简谱存档已导入并用于渲染');
      return;
    }
    const rows = parseArchive(gongcheText);
    const meta = parseArchiveMeta(gongcheText);
    state.rows = rows;
    state.archiveText = gongcheText;
    if (numberedText) {
      state.numberedArchiveText = numberedText;
      state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
      state.slurs = state.numberedOverride.slurs || [];
    } else {
      state.numberedArchiveText = '';
      state.numberedOverride = null;
      state.slurs = [];
    }
    const parsedLyrics = parseArchiveLyrics(gongcheText);
    state.text = parsedLyrics || rows.map((column) => column.chars.map((row) => row.char).join('')).join('，');
    state.projectMeta = {
      ...state.projectMeta,
      title: meta.title || state.projectMeta.title,
      author: Object.prototype.hasOwnProperty.call(meta, 'author') ? meta.author : state.projectMeta.author,
      mode: meta.style || state.projectMeta.mode
    };
    state.archiveMeta = {
      ...state.archiveMeta,
      version: meta.version || state.archiveMeta.version,
      meter: meta.meter || state.archiveMeta.meter,
      style: meta.style || state.archiveMeta.style,
      key: meta.key || state.archiveMeta.key
    };
    input.value = state.text;
    syncProjectMetaDisplay();
    saveLabeledState(numberedText ? '导入完整存档' : '导入工尺存档');
    renderBoard();
    renderScore();
    document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
    if (showMessage) showToast('存档修改已同步');
  } catch (error) {
    if (showMessage) showToast(error.message || '存档格式有误');
  }
}

function copyArchive() {
  const text = exportCombinedArchive();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('存档文本已复制')).catch(() => showToast('复制失败，请手动复制'));
    return;
  }
  archiveEditor.focus();
  archiveEditor.select();
  showToast('请使用 Ctrl+C 复制存档文本');
}

function downloadArchive() {
  const blob = new Blob([getArchiveForDownload()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'gongchepu.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('存档文件已导出');
}

function openArchiveFile() {
  archiveFileInput.value = '';
  archiveFileInput.click();
}

function convertToScore() {
  try {
    // The Gongche archive is the source. Conversion writes a numbered archive
    // beside it, then the score view reads only that numbered archive.
    const gongcheText = exportArchive();
    state.rows = parseArchive(gongcheText);
    state.text = parseArchiveLyrics(gongcheText);
    state.numberedOverride = null;
    state.numberedArchiveText = '';
    state.slurs = [];
    renderScore();
    state.archiveText = exportCombinedArchive();
    if (archiveEditor) archiveEditor.value = state.archiveText;
    saveState('转写简谱');
    showToast('已按 2/4 拍一板一眼转写简谱');
  } catch (error) {
    console.error('Score conversion failed:', error);
    showToast('简谱转写失败，请检查节奏标注');
  }
}

function renderBoard() {
  board.classList.toggle('rhythm-editing', state.activeTool === 'rhythm');
  board.classList.toggle('single-view', state.gongcheView === 'single');
  board.classList.toggle('fit-enabled', state.gongcheView === 'fit');
  const renderColumns = state.rows.map((column, columnIndex) => ({
    column,
    columnIndex,
    chars: column.chars.map((row, charIndex) => ({ row, charIndex }))
      .filter(({ charIndex }) => (state.activeTool !== 'rhythm' && state.gongcheView !== 'single') || flattenIndex(columnIndex, charIndex) === selectedIndex)
  })).filter(({ chars }) => chars.length);
  board.innerHTML = state.rows.length ? renderColumns.map(({ column, columnIndex, chars }) => `
    <div class="notation-column" data-column="${columnIndex}">
      ${chars.map(({ row, charIndex }) => `
          <div class="notation-cell ${flattenIndex(columnIndex, charIndex) === selectedIndex ? 'selected' : ''}" data-column="${columnIndex}" data-index="${charIndex}">
            <div class="lyric-char">${row.char}</div>
            <div class="char-annotation">
            <div class="note-stack">${row.notes.map((note, noteIndex) => `<button class="notation-note ${selectedIndex === flattenIndex(columnIndex, charIndex) && selectedNoteIndex === noteIndex && state.activeTool === 'rhythm' ? 'rhythm-target' : ''}" style="--note-index:${noteIndex}" data-note-index="${noteIndex}" data-type="note" title="点击选中工尺字符">${renderGongcheNote(note)}</button>`).join('')}</div>
            ${row.notes.map((note, noteIndex) => `<div class="rhythm-stack" style="--note-index:${noteIndex}">${(row.noteRhythms[noteIndex] || []).map((rhythm, rhythmIndex) => rhythm ? `<span class="notation-rhythm ${rhythm === '△' ? 'triangle-rhythm' : ''}" style="--rhythm-index:${rhythmIndex}">${rhythm === '—' ? '__' : rhythm}</span>` : '').join('')}</div>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('') : '<div class="empty-board">先输入一段文字，开始编排你的旋律</div>';
  renderLyricAttributes();
  requestAnimationFrame(fitGongcheBoard);
  syncArchiveFromState();
}

function fitGongcheBoard() {
  if (state.gongcheView !== 'fit') {
    board.style.removeProperty('--gongche-scale');
    return;
  }
  const availableHeight = board.clientHeight;
  const columns = [...board.querySelectorAll('.notation-column')];
  const tallestColumn = Math.max(0, ...columns.map((column) => column.scrollHeight));
  if (!tallestColumn || !availableHeight) return;
  const scale = Math.min(1, Math.max(.45, (availableHeight - 36) / tallestColumn));
  if (board.dataset.gongcheScale !== scale.toFixed(3)) {
    board.dataset.gongcheScale = scale.toFixed(3);
    board.style.setProperty('--gongche-scale', scale.toFixed(3));
  }
  board.classList.toggle('fit-height', scale < .99);
}

function syncToolButtons() {
  document.querySelector('[data-action="note-mode"]')?.classList.toggle('active', state.activeTool === 'note');
  document.querySelector('[data-action="rhythm-mode"]')?.classList.toggle('active', state.activeTool === 'rhythm');
}

function flattenIndex(columnIndex, charIndex) {
  return state.rows.slice(0, columnIndex).reduce((total, column) => total + column.chars.length, 0) + charIndex;
}

function getCharacterAt(index) {
  let offset = 0;
  for (const column of state.rows) {
    if (index < offset + column.chars.length) return column.chars[index - offset];
    offset += column.chars.length;
  }
  return null;
}

function totalCharacters() {
  return state.rows.reduce((total, column) => total + column.chars.length, 0);
}

function getAllCharacters() {
  return state.rows.flatMap((column) => column.chars);
}

const pentatonicScale = ['1', '2', '3', '5', '6'];
const lowGongche = new Set(['合', '四', '一']);

function nextPentatonic(number) {
  const source = String(number);
  const prefix = source.startsWith('^') ? '^' : source.startsWith('_') ? '_' : '';
  const plainNumber = source.replace(/^[_^]+/, '');
  const index = pentatonicScale.indexOf(plainNumber);
  if (index === -1) return plainNumber;
  if (plainNumber === '6') return prefix === '_' ? '' + '^1' : '^1';
  return `${prefix}${pentatonicScale[index + 1]}`;
}

function scoreNoteMarkup(number, graceNumber, char) {
  if (!graceNumber) return `<span class="score-note"><strong>${number}</strong><small>${char}</small></span>`;
  return `<span class="score-note"><strong>${number}<sup class="grace-note">${graceNumber}</sup></strong><small>${char}</small></span>`;
}

function renderGracePitch(pitch) {
  const text = String(pitch);
  const isHigh = text.startsWith('^');
  const isLow = text.startsWith('_');
  const number = text.replace(/^[_^]+/, '');
  return `<span class="grace-pitch ${isHigh ? 'grace-high' : ''} ${isLow ? 'grace-low' : ''}">${isHigh ? '<i class="grace-octave-dot"></i>' : ''}${isLow ? '_' : ''}${number}</span>`;
}

function groupedScoreMarkup(group, divisionLevel = 0, showLyric = true) {
  const rootPitch = group.high ? `^${group.number}` : group.low ? `_${group.number}` : group.number;
  const gracePitch = group.graces?.length ? group.graces.map((pitch) => pitch === '√' ? nextPentatonic(rootPitch) : pitch) : [];
  const graceMarkup = gracePitch.length ? `<span class="grace-cluster"><sup class="grace-note">${gracePitch.map(renderGracePitch).join('')}</sup><i class="grace-link">=</i><i class="grace-sign">╯</i></span>` : '';
  const isLow = group.low || (!group.high && lowGongche.has(group.gongche));
  const lowClass = isLow ? ' low-note' : '';
  const divisionClass = divisionLevel === 2 ? ' divided-twice' : divisionLevel === 1 ? ' divided-once' : '';
  const displayNumber = numberedValue(group);
  const highClass = group.high ? ' high-note' : '';
  const octavePrefix = '';
  const largeDot = group.largeDot || group.notes?.some((note) => note.largeDot) ? '<i class="large-dot"></i>' : '';
  return `<span class="score-note${lowClass}${highClass}${divisionClass}">
    <span class="high-row"><i class="high-dot"></i></span>
    <strong>${graceMarkup}${octavePrefix}${displayNumber}${largeDot}</strong>
    <span class="division-line division-first"></span>
    <span class="division-line division-second"></span>
    <span class="low-row"><i class="low-dot"></i></span>
    <small>${showLyric ? group.char : ''}</small>
  </span>`;
}

function normalizeSustainedBeats(bars) {
  return bars.map((bar) => {
    const first = bar.first.map((group) => ({ ...group, notes: group.notes.map((note) => ({ ...note })) }));
    const second = bar.second.map((group) => ({ ...group, notes: group.notes.map((note) => ({ ...note })) }));
    if (first.length === 1 && first[0].notes.length === 1 && second.length >= 1 && second[0].notes.length >= 1) {
      const firstNote = first[0].notes[0];
      const secondNote = second[0].notes[0];
      const sameSource = first[0].rowId === second[0].rowId
        || (firstNote.char && firstNote.char === secondNote.char)
        || ((firstNote.lyric || firstNote.char) && !(secondNote.lyric || secondNote.char));
      const samePitch = firstNote.number === secondNote.number
        && firstNote.high === secondNote.high
        && firstNote.low === secondNote.low;
      if (sameSource && samePitch && second[0].notes.length === 1 && (firstNote.lyric || firstNote.char)) {
        secondNote.number = '—';
        secondNote.gongche = '—';
        secondNote.low = false;
        secondNote.high = false;
        secondNote.graces = [];
        secondNote.lyric = '';
        secondNote.char = '';
      }
      if (sameSource && samePitch && second.length >= 2 && (firstNote.lyric || firstNote.char)) {
        firstNote.largeDot = true;
        second.shift();
        second.forEach((group) => group.notes.forEach((note) => {
          note.division = Math.max(1, note.division || 0);
        }));
      }
    }
    if (first.length >= 2 && second.length >= 2) {
      const firstTail = first[first.length - 1];
      const secondHead = second[0];
      const firstNote = firstTail.notes[0];
      const secondNote = secondHead.notes[0];
      const sameSource = firstTail.rowId === secondHead.rowId
        || (firstNote.char && firstNote.char === secondNote.char)
        || ((firstNote.lyric || firstNote.char) && !(secondNote.lyric || secondNote.char));
      const samePitch = firstNote.number === secondNote.number
        && firstNote.high === secondNote.high
        && firstNote.low === secondNote.low;
      if (sameSource && samePitch) {
        secondHead.notes.shift();
        if (!secondHead.notes.length) second.splice(0, 1);
        first[0].notes[0].division = 1;
        firstTail.notes[0].division = 0;
        second.forEach((group) => group.notes.forEach((note) => { note.division = 1; }));
      }
    }
    return { first, second };
  });
}

function getDivisionLevel(groups, group, noteIndex) {
  const hasMultipleCharacters = groups.length > 1;
  const noteCount = new Set(group.notes.map((note) => note.eventId || note)).size;

  // First divide by lyric character. Only after that do we divide the
  // notes belonging to one character. Three notes use the 1(23) pattern.
  if (noteCount === 4) return noteIndex < 2 ? 1 : 2;
  if (noteCount === 3) return noteIndex === 0 ? 1 : 2;
  if (noteCount === 2) return hasMultipleCharacters ? 2 : 1;
  if (hasMultipleCharacters) return 1;
  return 0;
}

function getArchiveDivisionLevel(groups, groupIndex, noteIndex) {
  const totalNotes = groups.reduce((total, group) => total + group.notes.length, 0);
  const offset = groups.slice(0, groupIndex).reduce((total, group) => total + group.notes.length, 0) + noteIndex;
  // Four notes in one beat are two equal pairs. Do not apply the three-note
  // tail rule to notes 3 and 4; every note belongs to the same first split.
  if (totalNotes === 4) return 1;
  if (totalNotes === 3) return offset === 0 ? 1 : 2;
  if (totalNotes === 2) return 1;
  return 0;
}

function legacyRenderScore() {
  const preview = document.querySelector('#score-preview');
  const characters = getAllCharacters();
  if (!state.numberedOverride && !state.numberedArchiveText && !characters.some((row) => row.notes.length)) {
    preview.innerHTML = '<div class="score-module-title"><div class="score-module-heading"><span>03</span><strong>简谱</strong><small>点击“转写简谱”生成</small></div></div><div class="score-empty-module">简谱模块暂为空</div>';
    preview.hidden = false;
    return;
  }
  if (!characters.length) {
    preview.hidden = true;
    return;
  }
  const bars = [];
  let lastPitch = null;
  let activeBeat = -1;
  let lastGroup = null;
  let lastEmittedGroup = null;
  let pendingTriangleGroup = null;

  function startBeat(beat) {
    if (beat === 0) {
      bars.push({ first: [], second: [] });
    } else if (!bars.length) {
      bars.push({ first: [], second: [] });
    }
    activeBeat = beat;
    lastGroup = null;
    pendingTriangleGroup = null;
  }

  characters.forEach((row) => {
  row.notes.forEach((note, noteIndex) => {
      const rhythms = row.noteRhythms[noteIndex] || [];
      const markers = rhythms.filter((rhythm) => rhythmBeat(rhythm) !== null);
      const isTriangle = rhythms.includes('△');
      const isDash = rhythms.includes('—');
      const targetBeats = markers.length
        ? markers.map((marker) => rhythmBeat(marker))
        : (activeBeat < 0 ? [] : [activeBeat]);

      // A marker belongs to the note before the next marker, even when the
      // next marker is attached to the same lyric character. This lets one
      // character span both beats, e.g. 、。 or 。、.
      targetBeats.forEach((beat, markerIndex) => {
        if (markers.length) {
          const marker = markers[markerIndex];
          if (rhythmBeat(marker) === 0) startBeat(0);
          if (rhythmBeat(marker) === 1) startBeat(1);
        }
        if (activeBeat < 0 || !bars.length) return;

        if (!markers.length && pendingTriangleGroup && !isTriangle && !isDash && note !== '√') {
          const continuation = { number: gongchePitch(note) || '—', gongche: note, char: row.char, graces: [] };
          pendingTriangleGroup.notes.push(continuation);
          lastGroup = continuation;
          if (gongchePitch(note)) lastPitch = gongchePitch(note);
          return;
        }

        if (note === '√') {
          if (lastGroup && lastPitch) {
            const grace = nextPentatonic(lastPitch);
            lastGroup.graces.push(grace);
            lastPitch = grace;
          }
          return;
        }

        const number = gongchePitch(note) || '—';
        const group = { number, gongche: note, char: row.char, graces: [], isSubdivision: isTriangle || isDash };

        if ((isDash || isTriangle) && !markers.length) {
          // Always use the immediately preceding emitted group. Looking up
          // the last group of a whole beat can reach back into the previous
          // phrase when a dash crosses a beat boundary.
          const currentBar = bars[bars.length - 1];
          const currentTarget = activeBeat === 0 ? currentBar.first : currentBar.second;
          const sourceGroup = currentTarget.at(-1);
          if (isTriangle) {
            // △ upgrades the current period beat: attach this note to the
            // previous group, then begin a nested group for following notes.
            const previousGroup = currentTarget.at(-1);
            if (previousGroup) previousGroup.notes.push(group);
            pendingTriangleGroup = { char: row.char, rowId: row.id, notes: [group] };
            currentTarget.push(pendingTriangleGroup);
            lastGroup = group;
            if (gongchePitch(note)) lastPitch = gongchePitch(note);
            return;
          }
          // — upgrades 、. If it lands on beat two, carry the previous beat's
          // — is an extension, not a move: keep the current note in its
          // normal beat and also append that same note to the immediately
          // preceding group. The lyric travels with the extended note.
          if (isDash && sourceGroup) sourceGroup.notes.push(group);
        }
        const target = activeBeat === 0 ? bars[bars.length - 1].first : bars[bars.length - 1].second;
        const charGroup = target.find((item) => item.char === row.char && item.rowId === row.id);
        if (charGroup) charGroup.notes.push(group);
        else target.push({ char: row.char, rowId: row.id, notes: [group] });
        // First locate the note by its marker, then apply the upgrade by
        // carrying it one beat backward. This keeps —/△ from changing the
        // bar boundary while still adding their subdivision effect.
        if (isDash || isTriangle) {
          const previousTarget = activeBeat === 0 ? bars[bars.length - 1].second : bars[bars.length - 1].first;
          const previousGroup = previousTarget.at(-1);
          if (previousGroup && previousGroup !== target.at(-1)) {
            previousGroup.notes.push(group);
            const currentIndex = target.indexOf(target.find((item) => item.notes.includes(group)));
            if (currentIndex !== -1) target.splice(currentIndex, 1);
          }
        }
        lastGroup = group;
        lastEmittedGroup = group;
        if (gongchePitch(note)) lastPitch = gongchePitch(note);
      });
    });
  });
  const renderedBars = prepareNumberedBarsForView(state.numberedOverride || (bars.length ? bars : [{ first: [], second: [] }]));
  if (!state.numberedOverride) {
    state.numberedArchiveText = exportNumberedArchive(renderedBars);
  }
  if (!state.numberedOverride) {
    state.numberedArchiveText = exportNumberedArchive(renderedBars);
    if (numberedArchivePanel && !numberedArchivePanel.hidden && document.activeElement !== numberedArchiveEditor) numberedArchiveEditor.value = state.numberedArchiveText;
  }
  const renderedLyrics = new Set();
  const renderBeat = (groups) => groups.length ? groups.map((group, groupIndex) => `
    <span class="score-char-group" style="--group-size:${groups.length}">
      ${group.notes.map((note, noteIndex) => {
        const divisionLevel = getDivisionLevel(groups, group, noteIndex);
        // rowId identifies one occurrence in the lyric stream. Repeated lyric
        // characters in different rows remain independent; multiple notes in
        // one row can only claim that row's lyric once.
        const showLyric = noteIndex === 0 && !renderedLyrics.has(group.rowId);
        if (showLyric) renderedLyrics.add(group.rowId);
        return groupedScoreMarkup(note, divisionLevel, showLyric);
      }).join('')}
    </span>
  `).join('') : '<span class="score-empty">·</span>';
  const markup = renderedBars.map((bar) => `
    <div class="score-bar">
      <div class="score-beat">${renderBeat(bar.first)}</div>
      <div class="score-beat">${renderBeat(bar.second)}</div>
    </div>
  `).join('');
  preview.innerHTML = `<div class="score-heading"><strong>简谱 · 2/4</strong><span>、开启新小节第一拍，。切换到同小节第二拍</span></div><div class="score-line">${markup}</div>`;
  preview.hidden = false;
}

function renderScore() {
  const preview = document.querySelector('#score-preview');
  const characters = getAllCharacters();
  const bars = [];
  let currentBar = null;
  let currentBeat = null;
  const events = [];
  const ensureBar = () => currentBar || (currentBar = { first: [], second: [] }, bars.push(currentBar), currentBar);
  characters.forEach((row) => row.notes.forEach((note, noteIndex) => {
    const rhythms = row.noteRhythms[noteIndex] || [];
    // Every rhythm mark creates its own time position. Marks that map to the
    // same beat are intentionally not merged: 、。- has three positions.
    const placements = rhythms
      .map((rhythm, rhythmIndex) => {
        const previousRhythm = rhythms[rhythmIndex - 1];
        // Two adjacent special pairs are read as ordinary beat markers:
        // 。- becomes 。、, and 、△ becomes 、。 . The second symbol keeps
        // its position but loses its upgrade effect.
        const isPeriodDashPair = previousRhythm === '。' && rhythm === '—';
        const isCommaTrianglePair = previousRhythm === '、' && rhythm === '△';
        return {
          rhythm,
          beat: isPeriodDashPair ? 0 : isCommaTrianglePair ? 1 : rhythmBeat(rhythm),
          dash: rhythm === '—' && !isPeriodDashPair,
          triangle: rhythm === '△' && !isCommaTrianglePair
        };
      })
      .filter((placement) => placement.beat !== null);
    const markerBeats = placements.map((placement) => placement.beat);
    const isGrace = note === '√';
    const beatsForNote = isGrace ? (currentBeat === null ? [] : [{ beat: currentBeat }]) : (placements.length ? placements : (currentBeat === null ? [] : [{ beat: currentBeat }]));
    if (!beatsForNote.length) return;

    // One Gongche note may carry two rhythm marks. It must be emitted once
    // for each marked beat, rather than only using the first mark.
    beatsForNote.forEach((placement) => {
      const beat = placement.beat;
      const startsBar = placement.rhythm === '、' || placement.rhythm === '—';
      if (beat === 0 && (startsBar || currentBeat === null)) {
        currentBar = { first: [], second: [] };
        bars.push(currentBar);
        currentBeat = 0;
      } else if (beat === 1) {
        ensureBar();
        currentBeat = 1;
      }
      const event = {
        eventId: events.length,
        row,
        note,
        rowId: row.id,
        bar: ensureBar(),
        beat,
        dash: placement.dash || false,
        triangle: placement.triangle || false,
        grace: isGrace,
        // The upgraded sound always extends forward. The lyric moves only
        // when this is the lyric character's first Gongche note; later notes
        // keep the lyric anchored to that first note.
        moveLyric: noteIndex === 0 && (placement.dash || placement.triangle)
      };
      event.bar[beat === 0 ? 'first' : 'second'].push(event);
      events.push(event);
    });
  }));
  events.forEach((event, index) => {
    const previous = events[index - 1];
    if ((event.dash || event.triangle) && previous) (previous.extensions ||= []).push(event);
  });

  // An upgrade creates a front-extension relationship. Keep the original
  // board/eye slot AND the earlier front-extension slot. The lyric anchor is
  // assigned later only to the earlier front-extension copy.

  // Stage 3: retain every lyric event. Any visual same-pitch cleanup belongs
  // to the numbered-score view and must not discard source lyric positions.

  // Stage 4: group by lyric character after placement.
  bars.forEach((bar) => ['first', 'second'].forEach((key) => {
    const grouped = [];
    bar[key].forEach((event) => {
      if (event.grace) return;
      let group = grouped.find((item) => item.rowId === event.rowId);
      if (!group) { group = { char: event.row.char, rowId: event.rowId, notes: [] }; grouped.push(group); }
       const octave = gongcheOctave(event.note);
       const model = { eventId: event.eventId, sourceRowId: event.rowId, sourceChar: event.row.char, number: gongchePitch(event.note) || '—', gongche: baseGongche(event.note), high: octave.high, low: octave.low, char: event.row.char, lyric: '', graces: [], division: event.dash || event.triangle ? 1 : 0, isSubdivision: event.dash || event.triangle, hideLyric: event.moveLyric, frontExtension: event.moveLyric };
       event.model = model;
       if (!group.notes.some((item) => item.eventId === model.eventId)) group.notes.push(model);
       (event.extensions || []).forEach((extension) => {
         if (group.notes.some((item) => item.eventId === extension.eventId)) return;
           const extensionOctave = gongcheOctave(extension.note);
           group.notes.push({
             eventId: extension.eventId,
             sourceRowId: extension.rowId,
             sourceChar: extension.row.char,
             number: gongchePitch(extension.note) || '—',
             gongche: baseGongche(extension.note),
             high: extensionOctave.high,
             low: extensionOctave.low,
             char: extension.row.char,
             lyric: '',
             graces: [],
             division: 1,
             isSubdivision: true,
             forceLyric: extension.moveLyric,
             frontExtension: extension.moveLyric
           });
       });
    });
    bar[key] = grouped;
  }));

  // Post-process grace notes after bar placement and subdivision. They never
  // create a beat; they attach to the preceding real note only.
  let previousModel = null;
  events.forEach((event) => {
    if (event.grace) {
      if (previousModel?.number) previousModel.graces.push(nextPentatonic(previousModel.number));
    } else if (event.model) {
      previousModel = event.model;
    }
  });
  // Finalize placement into the numbered archive before rendering. The view
  // consumes these already-positioned bars and does not make lyric-placement
  // decisions again.
  if (!state.numberedOverride) {
    assignNumberedLyrics(bars);
    state.numberedArchiveText = exportNumberedArchive(bars);
    state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
  }
  const renderedBars = normalizeSustainedBeats(prepareNumberedBarsForView(state.numberedOverride || [{ first: [], second: [] }]));
  const renderedLyrics = new Set();
  const renderBeat = (groups, barIndex, beatKey) => {
    if (!groups.length) return '<span class="score-empty">·</span>';
    const entries = groups.flatMap((group, groupIndex) => group.notes
      .filter((note, index, all) => index === all.findIndex((item) => item.eventId === note.eventId))
      .map((note, noteIndex) => ({ group, groupIndex, note, noteIndex })));
    const totalNotes = entries.length;
    const renderEntry = (entry, level, notePosition) => {
      const { group, note, noteIndex } = entry;
      const show = state.numberedOverride
        ? (noteIndex === 0 && note.lyric !== undefined)
        : (noteIndex === 0 && (note.forceLyric || (!note.hideLyric && !renderedLyrics.has(group.rowId))));
      if (show) renderedLyrics.add(group.rowId);
      const noteLevel = note.division ?? level;
      return `<span class="slur-note-anchor" data-slur-note="${barIndex}:${beatKey}:${notePosition}">${groupedScoreMarkup(note, noteLevel, show)}</span>`;
    };
    if (totalNotes === 4) {
      const firstPair = entries.slice(0, 2).map((entry, index) => renderEntry(entry, 0, index)).join('');
      const secondPair = entries.slice(2, 4).map((entry, index) => renderEntry(entry, 0, index + 2)).join('');
      return `<span class="score-four-group"><span class="score-char-group score-pair-group">${firstPair}</span><span class="score-char-group score-pair-group">${secondPair}</span></span>`;
    }
    return entries.map((entry, index) => renderEntry(entry, getArchiveDivisionLevel(groups, entry.groupIndex, entry.noteIndex), index)).join('');
  };
  const markup = renderedBars.map((bar, barIndex) => `<div class="score-bar"><div class="score-beat">${renderBeat(bar.first, barIndex, 'first')}</div><div class="score-beat">${renderBeat(bar.second, barIndex, 'second')}</div></div>`).join('');
  const archiveText = state.numberedArchiveText || exportNumberedArchive(renderedBars);
  const archiveView = state.viewFlags.scoreArchive;
  preview.innerHTML = `<div class="score-module-title"><div class="score-module-heading"><strong>简谱</strong><small>由简谱存档渲染</small></div></div>${archiveView ? `<section class="score-archive-view"><div class="archive-toolbar"><span>Numbered Markdown · 编辑后点击保存修改</span><button class="archive-small-button" data-action="save-score-archive">保存修改</button></div><textarea id="score-archive-editor" spellcheck="false">${archiveText}</textarea><p class="archive-hint">修改简谱存档不会反向改动工尺谱。</p></section>` : `<div class="score-line">${markup}</div>`}`;
  numberedArchivePanel = preview.querySelector('.score-archive-view');
  numberedArchiveEditor = preview.querySelector('#score-archive-editor');
  preview.hidden = false;
  if (!archiveView) requestAnimationFrame(() => { markScoreRowEnds(); renderSlurs(); });
}

function toggleNumberedView() {
  state.numberedView = state.numberedView === 'score' ? 'archive' : 'score';
  renderScore();
}

function saveScoreArchiveFromView() {
  const editor = document.querySelector('#score-archive-editor');
  if (!editor) return;
  try {
    state.numberedOverride = parseNumberedArchive(editor.value);
    state.slurs = state.numberedOverride.slurs || [];
    state.numberedArchiveText = editor.value;
    saveState('保存简谱存档');
    showToast('简谱存档已保存');
    renderScore();
  } catch (error) {
    showToast(error.message || '简谱存档格式有误');
  }
}

function markScoreRowEnds() {
  const bars = [...document.querySelectorAll('.score-line .score-bar')];
  bars.forEach((bar) => bar.classList.remove('row-end'));
  bars.forEach((bar, index) => {
    const next = bars[index + 1];
    if (!next || next.offsetTop !== bar.offsetTop) bar.classList.add('row-end');
  });
}

function slurPosition(key) {
  const [bar, beat, note] = key.split(':');
  return Number(bar) * 10000 + (beat === 'first' ? 0 : 1000) + Number(note);
}

function slurCrosses(start, end) {
  const a = slurPosition(start);
  const b = slurPosition(end);
  return state.slurs.some((slur) => {
    const x = slurPosition(slur.start);
    const y = slurPosition(slur.end);
    return (a < x && x < b && b < y) || (x < a && a < y && y < b);
  });
  const slurButton = document.querySelector('[data-translation-slur]');
  if (slurButton) slurButton.disabled = !state.numberedOverride;
}

function slurContains(outer, inner) {
  return slurPosition(outer.start) <= slurPosition(inner.start)
    && slurPosition(outer.end) >= slurPosition(inner.end)
    && (outer.start !== inner.start || outer.end !== inner.end);
}

function slurLevel(slur, slurs = state.slurs) {
  const nested = slurs.filter((candidate) => slurContains(slur, candidate));
  return nested.length ? 1 + Math.max(...nested.map((candidate) => slurLevel(candidate, slurs))) : 1;
}

function exceedsSlurNesting(candidate) {
  const slurs = [...state.slurs, candidate];
  return slurs.some((slur) => slurLevel(slur, slurs) > maxSlurNesting);
}

function renderSlurs() {
  const scoreLine = document.querySelector('.score-line');
  if (!scoreLine) return;
  scoreLine.querySelector('.slur-overlay')?.remove();
  if (!state.slurs.length) return;
  const rect = scoreLine.getBoundingClientRect();
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'slur-overlay');
  overlay.setAttribute('viewBox', `0 0 ${scoreLine.clientWidth} ${scoreLine.clientHeight}`);
  overlay.setAttribute('width', scoreLine.clientWidth);
  overlay.setAttribute('height', scoreLine.clientHeight);
  const bars = [...scoreLine.querySelectorAll('.score-bar')];
  const rowBounds = new Map();
  bars.forEach((bar) => {
    const barRect = bar.getBoundingClientRect();
    const row = Math.round(barRect.top - rect.top);
    const current = rowBounds.get(row) || { top: row, left: Infinity, right: -Infinity };
    current.left = Math.min(current.left, barRect.left - rect.left);
    current.right = Math.max(current.right, barRect.right - rect.left);
    rowBounds.set(row, current);
  });
  const rows = [...rowBounds.values()].sort((a, b) => a.top - b.top);
  const appendArc = (x1, y1, x2, y2, lift) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - lift} ${x2} ${y2}`);
    path.setAttribute('class', 'slur-path');
    overlay.append(path);
  };
  state.slurs.forEach((slur) => {
    const start = scoreLine.querySelector(`[data-slur-note="${slur.start}"]`);
    const end = scoreLine.querySelector(`[data-slur-note="${slur.end}"]`);
    if (!start || !end) return;
    const a = start.getBoundingClientRect();
    const b = end.getBoundingClientRect();
    const x1 = a.left - rect.left + a.width / 2;
    const x2 = b.left - rect.left + b.width / 2;
    const y1 = a.top - rect.top - 3;
    const y2 = b.top - rect.top - 3;
    const level = slurLevel(slur);
    const lift = slurLiftByLevel[level] || slurLiftByLevel[maxSlurNesting];
    const startBar = start.closest('.score-bar');
    const endBar = end.closest('.score-bar');
    if (!startBar || !endBar) return;
    const startRow = Math.round(startBar.getBoundingClientRect().top - rect.top);
    const endRow = Math.round(endBar.getBoundingClientRect().top - rect.top);
    if (startRow === endRow) {
      appendArc(x1, y1, x2, y2, lift);
      return;
    }
    const startIndex = rows.findIndex((row) => row.top === startRow);
    const endIndex = rows.findIndex((row) => row.top === endRow);
    if (startIndex < 0 || endIndex < 0) return;
    const lineOffset = ((y1 - rows[startIndex].top) + (y2 - rows[endIndex].top)) / 2;
    const segments = [];
    segments.push({ row: rows[startIndex], x1, x2: rows[startIndex].right - 3 });
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      segments.push({ row: rows[index], x1: rows[index].left + 3, x2: rows[index].right - 3 });
    }
    segments.push({ row: rows[endIndex], x1: rows[endIndex].left + 3, x2 });
    const totalLength = segments.reduce((sum, segment) => sum + Math.max(0, segment.x2 - segment.x1), 0);
    if (!totalLength) return;
    let traveled = 0;
    segments.forEach((segment) => {
      const length = Math.max(0, segment.x2 - segment.x1);
      if (!length) return;
      const points = [];
      for (let step = 0; step <= 12; step += 1) {
        const local = step / 12;
        const t = (traveled + length * local) / totalLength;
        const x = segment.x1 + length * local;
        const y = segment.row.top + lineOffset - lift * 4 * t * (1 - t);
        points.push(`${step ? 'L' : 'M'} ${x} ${y}`);
      }
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', points.join(' '));
      path.setAttribute('class', 'slur-path');
      overlay.append(path);
      traveled += length;
    });
  });
  scoreLine.append(overlay);
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('.slur-note-anchor');
  if (!anchor || !state.slurMode) return;
  const key = anchor.dataset.slurNote;
  if (!state.pendingSlurStart) {
    state.pendingSlurStart = key;
    document.querySelectorAll('.slur-note-anchor').forEach((item) => item.classList.remove('slur-pending'));
    anchor.classList.add('slur-pending');
    showToast('已选择连音起点，请选择终点');
    return;
  }
  const start = state.pendingSlurStart;
  state.pendingSlurStart = null;
  document.querySelectorAll('.slur-note-anchor').forEach((item) => item.classList.remove('slur-pending'));
  if (start === key || slurPosition(start) >= slurPosition(key)) return showToast('终点必须在起点之后');
  if (slurCrosses(start, key)) return showToast('连音线不能交叉，只允许嵌套');
  const slur = { id: `slur-${Date.now()}`, start, end: key };
  if (exceedsSlurNesting(slur)) return showToast(`连音线最多嵌套 ${maxSlurNesting} 层`);
  state.slurs.push(slur);
  state.numberedArchiveText = exportNumberedArchive(state.numberedOverride || []);
  state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
  state.archiveText = exportCombinedArchive();
  saveState('绘制连音线');
  renderScore();
  showToast('连音线已绘制');
});

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);
}

function exportScoreImage() {
  const scoreLine = document.querySelector('.score-line');
  if (!scoreLine) {
    showToast('请先点击转写简谱');
    return;
  }
  const width = Math.max(scoreLine.scrollWidth + 32, 420);
  const height = Math.max(scoreLine.scrollHeight + 32, 110);
  const bars = [...scoreLine.querySelectorAll('.score-bar')];
  const lineRect = scoreLine.getBoundingClientRect();
  const barMarkup = bars.map((bar) => {
    const barRect = bar.getBoundingClientRect();
    const x = barRect.left - lineRect.left + 16;
    const y = barRect.top - lineRect.top + 16;
    const groups = [...bar.querySelectorAll('.score-note')].map((note) => {
      const rect = note.getBoundingClientRect();
      const nx = rect.left - lineRect.left + rect.width / 2 + 16;
      const ny = rect.top - lineRect.top + 30;
      const number = note.querySelector('strong')?.textContent || '';
      const lyric = note.querySelector('small')?.textContent || '';
      const lowDot = note.classList.contains('low-note') ? `<circle cx="${nx}" cy="${ny + 9}" r="2" class="low-dot-image"/>` : '';
      return `<text x="${nx}" y="${ny}" text-anchor="middle" class="number">${escapeXml(number)}</text>${lowDot}<text x="${nx}" y="${ny + 42}" text-anchor="middle" class="lyric">${escapeXml(lyric)}</text>`;
    }).join('');
    const rightEdge = barRect.right - lineRect.left + 16;
    const bottomEdge = barRect.bottom - lineRect.top + 16;
    return `<g>${groups}<line x1="${rightEdge}" y1="${y}" x2="${rightEdge}" y2="${bottomEdge}" class="bar-line"/></g>`;
  }).join('');
  const rowLines = [...scoreLine.querySelectorAll('.score-bar.row-end')].map((bar) => {
    const rect = bar.getBoundingClientRect();
    const y = rect.bottom - lineRect.top + 16;
    return `<line x1="16" y1="${y}" x2="${width - 16}" y2="${y}" class="row-line"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fffefa"/><style>.number{font:600 18px serif;fill:#3e4b42}.lyric{font:12px serif;fill:#a7a79e}.bar-line{stroke:#d9d8cf;stroke-width:1}.row-line{stroke:#d9d8cf;stroke-width:1}.low-dot-image{fill:#3e4b42}</style>${barMarkup}${rowLines}</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'gongchepu-score.svg';
  link.click();
  URL.revokeObjectURL(url);
  showToast('简谱图片已导出');
}

function selectCharacter(index) {
  selectedIndex = Math.max(0, Math.min(index, totalCharacters() - 1));
  selectedNoteIndex = 0;
  renderBoard();
}

function selectCell(columnIndex, charIndex) {
  selectedIndex = flattenIndex(columnIndex, charIndex);
  selectedNoteIndex = 0;
  renderBoard();
}

function syncRows() {
  state.rows = buildRows(state.text);
  selectedIndex = 0;
  saveState();
  renderBoard();
  document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
}

input.addEventListener('input', (event) => {
  if (!state.lyricReplacing) return;
  const row = getCharacterAt(selectedIndex);
  if (!row) return;
  row.char = [...event.target.value].slice(-1).join('');
  state.text = getAllCharacters().map((item) => item.char).join('');
  saveState('替换歌词');
  renderBoard();
});

lyricAttributes.addEventListener('input', (event) => {
  if (!event.target.matches('[data-attribute-char]')) return;
  const row = getCharacterAt(selectedIndex);
  if (!row) return;
  row.char = [...event.target.value].slice(-1).join('');
  event.target.value = row.char;
  state.text = getAllCharacters().map((item) => item.char).join('');
  saveState('替换歌词');
  renderBoard();
});

function syncLyricsWithoutTouchingNotes() {
  const oldChars = [...state.text].filter((char) => !separators.test(char) && !/\s/.test(char));
  const newChars = [...input.value].filter((char) => !separators.test(char) && !/\s/.test(char));
  const existing = getAllCharacters();
  let prefix = 0;
  while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) prefix += 1;
  let oldEnd = oldChars.length;
  let newEnd = newChars.length;
  while (oldEnd > prefix && newEnd > prefix && oldChars[oldEnd - 1] === newChars[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const removedCount = oldEnd - prefix;
  const insertedCount = newEnd - prefix;
  const makeEmptyRow = (index) => ({ id: `lyric-${Date.now()}-${index}`, char: '', notes: [], noteRhythms: [] });
  const newText = input.value;
  const charsOnly = [...newText].filter((char) => !separators.test(char) && !/\s/.test(char));
  const items = [];
  const deletionBlanks = Math.max(0, removedCount - insertedCount);

  // Keep suffix slots tied to their original positions. Deleted characters
  // leave blank slots; inserted characters get fresh empty slots. Existing
  // notes never slide onto a neighboring lyric.
  charsOnly.forEach((char, index) => {
    if (index === prefix) {
      for (let blank = 0; blank < deletionBlanks; blank += 1) items.push(makeEmptyRow(prefix + blank));
    }
    const oldIndex = index < prefix
      ? index
      : index < newEnd
        ? -1
        : index + removedCount - insertedCount;
    const row = oldIndex >= 0 ? existing[oldIndex] : makeEmptyRow(index);
    row.char = char;
    items.push(row);
  });
  if (deletionBlanks && charsOnly.length === prefix) {
    for (let blank = 0; blank < deletionBlanks; blank += 1) items.push(makeEmptyRow(prefix + blank));
  }

  // Rebuild only the visual sentence columns; each row object (and therefore
  // its notes/rhythms) remains the preserved slot selected above.
  const sentences = newText.split(separators).map((sentence) => [...sentence.replace(/\s/g, '')]).filter(Boolean);
  const columns = [];
  let cursor = 0;
  sentences.forEach((chars, columnIndex) => {
    const columnRows = [];
    let realChars = 0;
    while (realChars < chars.length && cursor < items.length) {
      const row = items[cursor++];
      columnRows.push(row);
      if (row.char) realChars += 1;
    }
    columns.push({ id: `lyrics-${columnIndex}`, chars: columnRows });
  });
  state.rows = columns.length ? columns : [{ id: 'lyrics-0', chars: items }];
  state.text = newText;
  saveState();
  renderBoard();
  document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
}

archiveFileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
     archiveEditor.value = await file.text();
     const previousViewFlags = { ...state.viewFlags };
     const previousGongcheView = state.gongcheView;
     applyArchive(true);
     state.viewFlags = previousViewFlags;
     state.gongcheView = previousGongcheView;
     syncViewFlags();
     renderBoard();
     renderScore();
  } catch {
    showToast('无法读取存档文件');
  }
});

archiveEditor.addEventListener('focus', () => { state.archiveEditing = true; });
archiveEditor.addEventListener('blur', () => { state.archiveEditing = false; });
document.addEventListener('click', (event) => {
  const settingsButton = event.target.closest('[data-action="settings"]');
  if (settingsButton) {
    const menu = document.querySelector('[data-settings-dropdown]');
    event.stopImmediatePropagation();
    menu.hidden = !menu.hidden;
    return;
  }
  const tutorialButton = event.target.closest('[data-action="tutorial"]');
  if (tutorialButton) {
    tutorialBackdrop.hidden = false;
    document.querySelector('[data-settings-dropdown]').hidden = true;
    return;
  }
  const historyAction = event.target.closest('[data-action="history-menu"]');
  if (historyAction) {
    const dropdown = document.querySelector('[data-history-dropdown]');
    document.querySelectorAll('[data-history-dropdown]').forEach((menu) => { if (menu !== dropdown) menu.hidden = true; });
    dropdown.hidden = !dropdown.hidden;
    if (!dropdown.hidden) renderHistoryMenu();
    return;
  }
  const projectMeta = event.target.closest('[data-project-meta]');
  if (projectMeta) {
    projectMeta.contentEditable = 'true';
    projectMeta.focus();
    const selection = window.getSelection();
    selection?.selectAllChildren(projectMeta);
    return;
  }
  if (event.target.closest('[data-action="archive-import"]')) applyArchive(true);
});

document.addEventListener('change', (event) => {
  const setting = event.target.closest('[data-setting="archiveEditable"]');
  if (setting) {
    state.archiveEditable = setting.checked;
    if (!state.archiveEditable) {
      state.viewFlags.gongcheArchive = false;
      state.viewFlags.scoreArchive = false;
    }
    syncViewFlags();
    saveState(setting.checked ? '开启存档编辑' : '关闭存档编辑');
    return;
  }
  const rerenderSetting = event.target.closest('[data-setting="scoreRerenderPrompt"]');
  if (!rerenderSetting) return;
  state.scoreRerenderPrompt = rerenderSetting.value;
  saveState(`重渲染设置：${rerenderSetting.options[rerenderSetting.selectedIndex].text}`);
});

board.addEventListener('click', (event) => {
  const cell = event.target.closest('.notation-cell');
  if (!cell) return;
  const noteButton = event.target.closest('[data-type="note"]');
  const columnIndex = Number(cell.dataset.column);
  const charIndex = Number(cell.dataset.index);
  selectedIndex = flattenIndex(columnIndex, charIndex);
  const column = state.rows[columnIndex];
  const row = column.chars[charIndex];
  if (!noteButton) {
    selectCell(columnIndex, charIndex);
    if (state.lyricReplacing) {
      showToast('请在左侧“歌词字”属性框中替换当前字');
    }
    return;
  }
  if (noteButton) {
    selectedNoteIndex = Number(noteButton.dataset.noteIndex);
    if (state.activeTool === 'rhythm') {
      renderBoard();
      return;
    }
    if (state.activeTool === 'note' || state.activeTool === null) {
      renderBoard();
      return;
    }
  }
  if (state.activeTool === 'rhythm') return renderBoard();
  if (noteButton) {
    const noteIndex = Number(noteButton.dataset.noteIndex);
      const current = notes.indexOf(baseGongche(row.notes[noteIndex]));
      row.notes[noteIndex] = notes[(current + 1) % notes.length];
  }
   saveLabeledState('修改工尺音符');
   renderBoard();
 });

document.addEventListener('click', (event) => {
  if (event.target === tutorialBackdrop) {
    tutorialBackdrop.hidden = true;
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  const attributeNote = event.target.closest('[data-attribute-note]');
  const attributeRhythm = event.target.closest('[data-attribute-rhythm]');
  if (attributeNote) {
    const row = getCharacterAt(selectedIndex);
    const noteIndex = Number(attributeNote.dataset.attributeNote);
    const current = notes.indexOf(baseGongche(row.notes[noteIndex]));
    row.notes[noteIndex] = notes[(current + 1) % notes.length];
    saveLabeledState('修改属性中的工尺');
    renderBoard();
    return;
  }
  if (attributeRhythm) {
    const [noteIndex, rhythmIndex] = attributeRhythm.dataset.attributeRhythm.split(':').map(Number);
    const row = getCharacterAt(selectedIndex);
    const rhythmList = row.noteRhythms[noteIndex] || [];
    rhythmList[rhythmIndex] = keyboardRhythms[String((Number(Object.keys(keyboardRhythms).find((key) => keyboardRhythms[key] === rhythmList[rhythmIndex]) || 1) % 4) + 1)] || '、';
    row.noteRhythms[noteIndex] = rhythmList;
    saveLabeledState('修改属性中的节奏');
    renderBoard();
    return;
  }
  if (!action) return;
  event.stopPropagation();
  if (action === 'file-menu' || action === 'notation-menu' || action === 'view-menu' || action === 'translation-menu') {
    const menu = event.target.closest('.view-menu-wrap')?.querySelector('.view-dropdown');
    document.querySelectorAll('.view-dropdown').forEach((item) => { if (item !== menu) item.hidden = true; });
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  if (action === 'gongche-view') {
    clearDefaultView();
    if (state.activeTool === 'rhythm') {
      state.activeTool = null;
      syncToolButtons();
    }
    const nextView = event.target.closest('[data-gongche-view]').dataset.gongcheView;
    const isSameView = state.viewFlags.gongche && state.gongcheView === nextView;
    state.gongcheView = nextView;
    if (state.gongcheView === 'single') {
      selectedIndex = Math.max(0, Math.min(selectedIndex, totalCharacters() - 1));
      selectedNoteIndex = 0;
    }
    state.viewFlags.gongche = !isSameView;
    state.gongcheFit = state.viewFlags.gongche && state.gongcheView === 'fit';
    state.viewFlags.gongcheArchive = false;
    saveState();
    refreshVisibleViews();
    closeMenus();
    return;
  }
  if (action === 'preview-mode') {
    state.activeTool = null;
    state.slurMode = false;
    state.lyricReplacing = false;
    syncToolButtons();
    syncNotationMenu();
    closeMenus();
    saveState('保存工尺存档');
    showToast('进入：预览模式');
    return;
  }
  if (action === 'new-project') {
    projectBackdrop.hidden = false;
    projectBackdrop.querySelector('[data-project-page="1"]').hidden = false;
    projectBackdrop.querySelector('[data-project-page="2"]').hidden = true;
    closeMenus();
  }
  if (action === 'project-close') projectBackdrop.hidden = true;
  if (action === 'rerender-confirm') {
    if (document.querySelector('#rerender-ignore').checked) state.scoreRerenderPrompt = 'off';
    syncViewFlags();
    rerenderBackdrop.hidden = true;
    renderScore();
    saveState('重新渲染简谱');
    return;
  }
  if (action === 'rerender-cancel') {
    if (document.querySelector('#rerender-ignore').checked) state.scoreRerenderPrompt = 'off';
    syncViewFlags();
    rerenderBackdrop.hidden = true;
    saveState('保持简谱排版');
    return;
  }
  if (action === 'project-next') {
    projectBackdrop.querySelector('[data-project-page="1"]').hidden = true;
    projectBackdrop.querySelector('[data-project-page="2"]').hidden = false;
  }
  if (action === 'project-create') {
    state.archiveEditable = false;
    state.projectMeta = { title: document.querySelector('#project-title').value || '未命名曲谱', author: document.querySelector('#project-author').value, mode: document.querySelector('#project-mode').value };
    state.text = document.querySelector('#project-lyrics').value;
    state.rows = buildRows(state.text);
    state.numberedArchiveText = '';
    state.numberedOverride = null;
    state.viewFlags.scoreArchive = false;
    state.viewFlags.score = true;
    const scorePreview = document.querySelector('#score-preview');
    if (scorePreview) {
      scorePreview.innerHTML = '';
      scorePreview.hidden = true;
    }
    numberedArchivePanel = null;
    numberedArchiveEditor = null;
    state.projectCreated = true;
    input.value = state.text;
    projectBackdrop.hidden = true;
    saveState('新建曲谱');
    refreshVisibleViews();
    syncProjectMetaDisplay();
    document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
    showToast('曲谱已创建');
    closeMenus();
  }
  if (event.target.closest('[data-lyric-index]')) {
    selectedIndex = Number(event.target.closest('[data-lyric-index]').dataset.lyricIndex);
    selectCharacter(selectedIndex);
  }
  if (action === 'clear') {
    input.value = '';
    state.text = '';
    state.rows = [];
    selectedIndex = 0;
    saveLabeledState('清空曲谱');
    renderBoard();
    document.querySelector('#char-count').textContent = '0 字';
    input.focus();
    closeMenus();
  }
  if (action === 'note-mode' || action === 'rhythm-mode') {
    const nextTool = action === 'note-mode' ? 'note' : 'rhythm';
    const wasRhythm = state.activeTool === 'rhythm';
    state.activeTool = state.activeTool === nextTool ? null : nextTool;
    state.slurMode = false;
    if (state.activeTool === 'note' && !state.viewFlags.gongche) {
      state.viewFlags.gongche = true;
      state.viewFlags.gongcheArchive = false;
      state.gongcheView = 'fit';
      state.gongcheFit = true;
    }
    if (state.activeTool === 'rhythm' && !state.viewFlags.gongche) {
      state.viewFlags.gongche = true;
      state.viewFlags.gongcheArchive = false;
      state.gongcheView = 'single';
      state.gongcheFit = false;
    }
    if (nextTool === 'rhythm' && state.activeTool === 'rhythm' && state.gongcheView !== 'single') {
      state.previousGongcheView = state.gongcheView;
      state.gongcheView = 'single';
    }
    if (wasRhythm && state.activeTool !== 'rhythm' && state.previousGongcheView !== null && state.gongcheView === 'single') {
      state.gongcheView = state.previousGongcheView || 'normal';
      state.previousGongcheView = null;
    }
    syncToolButtons();
    syncNotationMenu();
    closeMenus();
    refreshVisibleViews();
    saveLabeledState('修改属性中的工尺');
    if (state.activeTool === 'note') showToast('进入：输入音符模式');
    if (state.activeTool === 'rhythm') showToast('进入：输入节奏模式');
  }
  if (action === 'replace-lyric') {
    state.slurMode = false;
    state.lyricReplacing = !state.lyricReplacing;
    if (state.lyricReplacing && !state.viewFlags.attributes) {
      state.viewFlags.attributes = true;
      state.viewFlags.gongche = false;
      state.viewFlags.gongcheArchive = false;
      syncViewFlags();
    }
    document.querySelector('[data-action="replace-lyric"]').classList.toggle('active', state.lyricReplacing);
    if (state.lyricReplacing) state.activeTool = null;
    syncToolButtons();
    syncNotationMenu();
    closeMenus();
    saveLabeledState('修改属性中的节奏');
    if (state.lyricReplacing) {
      renderLyricAttributes();
      document.querySelector('[data-attribute-char]')?.focus();
      document.querySelector('[data-attribute-char]')?.select();
      showToast('进入：替换歌词模式');
    }
  }
  if (action === 'convert') {
    convertToScore();
    closeMenus();
    return;
  }
  if (action === 'slur-mode') {
    if (!state.numberedOverride) return showToast('请先转写简谱');
    state.slurMode = !state.slurMode;
    state.pendingSlurStart = null;
    if (state.slurMode) {
      state.activeTool = null;
      state.lyricReplacing = false;
      state.viewFlags.score = true;
      state.viewFlags.scoreArchive = false;
      refreshVisibleViews();
    }
    syncToolButtons();
    syncNotationMenu();
    closeMenus();
    renderScore();
    showToast(state.slurMode ? '进入：连音绘制模式' : '已退出连音绘制模式');
  }
  if (action === 'archive-toggle') {
    state.viewFlags.gongcheArchive = !state.viewFlags.gongcheArchive;
    if (state.viewFlags.gongcheArchive) {
      state.viewFlags.gongche = false;
      state.gongcheView = 'archive';
      archiveEditor.value = state.archiveText || exportArchive();
    } else {
      state.gongcheView = 'normal';
    }
    syncViewFlags();
    saveState('切换工尺存档视图');
    closeMenus();
  }
  if (action === 'numbered-save') saveNumberedArchive();
  if (action === 'save-score-archive') saveScoreArchiveFromView();
  if (action === 'archive-copy') copyArchive();
  if (action === 'archive-download') downloadArchive();
  if (action === 'archive-upload') openArchiveFile();
  if (action === 'tutorial') tutorialBackdrop.hidden = false;
  if (action === 'tutorial-close') tutorialBackdrop.hidden = true;
  if (action === 'tutorial-notes' || action === 'tutorial-rhythms') {
    tutorialDetailPanel.hidden = false;
    tutorialDetailPanel.innerHTML = action === 'tutorial-notes'
      ? '<strong>工尺输入法</strong><br>shang 上 · chi 尺 · gong 工 · fan 凡 · liu 六 · wu 五 · yi 乙 · he 合 · si 四 · ye 一<br><br>按住 CapsLock 输入高音，按住 Shift 输入低音。按 `-` 输入豁腔 √。'
      : '<strong>节奏输入法</strong><br>1 = 、（正板） · 2 = 。（正眼） · 3 = —（腰板） · 4 = △（腰眼）<br><br>每个工尺最多三个节奏，Backspace / Delete 删除最后一个节奏。';
  }
  if (action === 'export') downloadArchive();
  if (action === 'library') { showToast('曲谱库功能正在整理中'); }
  if (action === 'undo') undoState();
  if (action === 'redo') redoState();
});

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (!viewButton) return;
  if (viewButton.disabled) return;
  const view = viewButton.dataset.view;
  if (view === 'defaultView') {
    if (state.defaultView) {
      state.defaultView = false;
      syncViewFlags();
      saveState('关闭默认视图');
    } else {
      setDefaultView();
    }
    closeMenus();
    return;
  }
  clearDefaultView();
  if (view === 'gongcheArchive' && state.activeTool === 'rhythm') {
    state.activeTool = null;
    state.previousGongcheView = null;
    syncToolButtons();
  }
  state.viewFlags[view] = !state.viewFlags[view];
  if (view === 'score' || view === 'scoreArchive') {
    if (state.viewFlags[view]) {
      state.viewFlags.score = view === 'score';
      state.viewFlags.scoreArchive = view === 'scoreArchive';
    }
    if (!state.viewFlags.score && !state.viewFlags.scoreArchive) state.viewFlags.score = false;
  }
  if (view === 'attributes' || view === 'gongcheArchive') {
    if (state.viewFlags[view]) {
      if (view === 'attributes') state.viewFlags.attributes = true;
      if (view === 'gongcheArchive') {
        state.viewFlags.gongcheArchive = true;
        state.viewFlags.gongche = false;
      }
    }
  }
  if (view === 'gongcheArchive' && state.viewFlags[view]) {
    state.gongcheView = 'archive';
  }
  if (view === 'gongche' && state.viewFlags[view]) state.viewFlags.gongcheArchive = false;
  if (view === 'gongcheArchive' && !state.viewFlags[view]) {
    state.gongcheView = 'normal';
    state.viewFlags.gongche = false;
  }
  syncViewFlags();
  saveState('切换视图');
  renderBoard();
  renderScore();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && tutorialBackdrop && !tutorialBackdrop.hidden) {
    tutorialBackdrop.hidden = true;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoState();
    else undoState();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoState();
  }
});

document.addEventListener('keydown', (event) => {
  const projectMeta = event.target.closest?.('[data-project-meta]');
  if (!projectMeta) return;
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.stopImmediatePropagation();
    return;
  }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  projectMeta.blur();
});

document.addEventListener('focusout', (event) => {
  const projectMeta = event.target.closest?.('[data-project-meta]');
  if (!projectMeta) return;
  projectMeta.contentEditable = 'false';
  saveProjectMetaField(projectMeta.dataset.projectMeta, projectMeta);
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea, input') && event.target !== input) return;
  if (event.target === input && !state.lyricReplacing) return;
  if (event.key === 'Shift') {
    shiftHeld = true;
    return;
  }
  if (event.key === 'CapsLock') {
    capsLockHeld = true;
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    if (event.target === input && state.lyricReplacing) return;
    event.preventDefault();
    keyboardBuffer = '';
    const character = getCharacterAt(selectedIndex);
    if (character) {
      if (state.activeTool === 'rhythm') {
        const rhythms = character.noteRhythms[selectedNoteIndex] || [];
        rhythms.pop();
        character.noteRhythms[selectedNoteIndex] = rhythms;
        saveLabeledState('删除节奏');
      }
      else if (state.activeTool === 'note') {
        character.notes.pop();
        character.noteRhythms.pop();
        selectedNoteIndex = Math.max(0, character.notes.length - 1);
        saveLabeledState('删除工尺音符');
      }
      else return;
      renderBoard();
    }
    return;
  }
  if (event.key === '-') {
    event.preventDefault();
    keyboardBuffer = '';
    const character = getCharacterAt(selectedIndex);
    if (character && state.activeTool === 'note') {
      character.notes.push('√');
      saveLabeledState('添加豁腔');
      renderBoard();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    selectCharacter(selectedIndex + 1);
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    selectCharacter(selectedIndex - 1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    keyboardBuffer = '';
    selectCharacter(selectedIndex + 1);
    return;
  }
  if (/^[a-z]$/i.test(event.key)) {
    if (state.activeTool !== 'note') return;
    keyboardBuffer += event.key.toLowerCase();
    clearTimeout(keyboardTimer);
    keyboardTimer = setTimeout(() => { keyboardBuffer = ''; }, 900);
    const matches = Object.keys(keyboardNotes).filter((name) => name.startsWith(keyboardBuffer));
    const matchedNote = keyboardNotes[keyboardBuffer];
    if (matchedNote) {
      const character = getCharacterAt(selectedIndex);
      if (character) {
        const arrow = capsLockHeld && highInputNotes.has(matchedNote)
          ? '↑'
          : shiftHeld && lowInputNotes.has(matchedNote)
            ? '↓'
            : '';
        character.notes.push(`${matchedNote}${arrow}`);
      }
      keyboardBuffer = '';
        saveLabeledState('输入工尺音符');
      renderBoard();
    } else if (!matches.length) {
      keyboardBuffer = '';
    }
    return;
  }
  if (state.activeTool === 'rhythm' && Object.prototype.hasOwnProperty.call(keyboardRhythms, event.key)) {
    event.preventDefault();
    const character = getCharacterAt(selectedIndex);
    if (character && character.notes.length) {
      const rhythms = character.noteRhythms[selectedNoteIndex] || [];
      if (rhythms.length < 3) rhythms.push(keyboardRhythms[event.key]);
      character.noteRhythms[selectedNoteIndex] = rhythms;
      saveLabeledState('输入节奏');
      renderBoard();
    }
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    showToast('当前页面暂不引入节拍与播放');
  }
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') shiftHeld = false;
  if (event.key === 'CapsLock') capsLockHeld = false;
});

window.addEventListener('resize', () => {
  requestAnimationFrame(renderSlurs);
});

ensureWorkspaceDefaults();
applyPaneWidths();
if (state.defaultView) setDefaultView();
syncToolButtons();
syncViewFlags();
syncNotationMenu();
  history.last = createStateSnapshot();
  history.lastLabel = '打开曲谱';
historyReady = true;
updateHistoryButtons();
convertButton?.addEventListener('click', convertToScore);
