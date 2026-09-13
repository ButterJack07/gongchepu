const gongcheMap = {
  上: '1', 尺: '2', 工: '3', 凡: '4', 六: '5', 五: '6', 乙: '7',
  合: '5', 四: '6', 一: '7', 伍: '6', 亿: '7', 句: '4',
};

const inputText = '春风又绿江南岸，明月何时照我还。';
const state = {
  text: inputText,
  key: 'C',
  tonality: '♩ = 72',
  activeTool: 'free',
  rows: [],
  archiveText: '',
  archiveEditing: false,
  numberedArchiveText: '',
  numberedOverride: null,
  numberedView: 'score',
  lyricReplacing: false,
  viewFlags: { attributes: false, gongche: true, gongcheArchive: false, score: true, scoreArchive: false },
  gongcheView: 'normal',
  previousGongcheView: null,
  paneWidths: { 'lyric-gongche': null, 'gongche-score': null },
  projectCreated: false,
  projectMeta: { title: '未命名曲谱', author: '', mode: '一板一眼' }
};

const notes = ['上', '尺', '工', '凡', '六', '五', '乙', '合', '四', '伍', '亿', '句'];
const separators = /[，。！？；：、,.!?;:\n]/;
const storageKey = 'gongchepu-editor-state';
const archiveFormat = 'gongchepu';
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
    if (!saved || typeof saved.text !== 'string' || !Array.isArray(saved.rows)) return;
    state.text = saved.text;
    state.rows = saved.rows;
    state.archiveText = typeof saved.archiveText === 'string' ? saved.archiveText : '';
    state.numberedArchiveText = typeof saved.numberedArchiveText === 'string' ? saved.numberedArchiveText : '';
    state.numberedOverride = saved.numberedOverride || null;
    if (saved.viewFlags && typeof saved.viewFlags === 'object') state.viewFlags = { ...state.viewFlags, ...saved.viewFlags };
    state.gongcheFit = Boolean(saved.gongcheFit);
    if (typeof saved.gongcheView === 'string') state.gongcheView = saved.gongcheView;
    if (typeof saved.previousGongcheView === 'string') state.previousGongcheView = saved.previousGongcheView;
    if (saved.paneWidths && typeof saved.paneWidths === 'object') {
      state.paneWidths = { ...state.paneWidths, ...saved.paneWidths };
    }
  } catch {
    // Directly opened local files may restrict storage access.
  }
}

function saveState() {
  if (!state.archiveEditing) state.archiveText = exportArchive();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ text: state.text, rows: state.rows, archiveText: state.archiveText, numberedArchiveText: state.numberedArchiveText, numberedOverride: state.numberedOverride, viewFlags: state.viewFlags, gongcheFit: state.gongcheFit, gongcheView: state.gongcheView, previousGongcheView: state.previousGongcheView, paneWidths: state.paneWidths }));
  } catch {
    // Keep editing available even when browser storage is unavailable.
  }
}

state.rows = buildRows(state.text);
loadSavedState();
state.activeTool = null;
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
         <div class="view-menu-wrap"><button class="view-menu-button" data-action="notation-menu">打谱</button><div class="view-dropdown" hidden><button data-action="preview-mode"><span>预览模式</span><b></b></button><div class="view-divider"></div><button data-action="replace-lyric"><span>替换歌词</span><b></b></button><button data-action="note-mode"><span>输入音符</span><b></b></button><button data-action="rhythm-mode"><span>输入节奏</span><b></b></button></div></div>
       <div class="view-menu-wrap"><button class="view-menu-button" data-action="view-menu">视图</button><div class="view-dropdown view-dropdown-list" hidden><button data-view="attributes"><span>属性视图</span><b>✓</b></button><div class="view-divider"></div><button data-action="gongche-view" data-gongche-view="normal"><span>工尺谱视图</span><b></b></button><button data-action="gongche-view" data-gongche-view="fit"><span>工尺谱自适应视图</span><b></b></button><button data-action="gongche-view" data-gongche-view="single"><span>工尺谱单字视图</span><b></b></button><div class="view-divider"></div><button data-view="gongcheArchive"><span>工尺存档视图</span><b>✓</b></button><div class="view-divider"></div><button data-view="score"><span>简谱视图</span><b>✓</b></button><button data-view="scoreArchive"><span>简谱存档视图</span><b>✓</b></button></div></div>
       </div>
       <div class="command-group"><button class="score-button" data-action="convert">转写简谱</button><button class="mini-button" data-action="undo">↶</button><button class="mini-button" data-action="redo">↷</button></div>
       <div class="header-actions">
         <div class="archive-header-actions"><button class="tutorial-button" data-action="tutorial">教程</button></div>
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
  if (showScore && document.querySelector('#score-preview').hidden) renderScore();
  document.querySelector('[data-divider="lyric-gongche"]').hidden = !state.viewFlags.attributes || !showGongche;
  document.querySelector('[data-divider="gongche-score"]').hidden = !showGongche || !showScore;
  archivePanel.hidden = !state.viewFlags.gongcheArchive;
  board.hidden = state.viewFlags.gongcheArchive;
  document.querySelector('.notation-footer')?.toggleAttribute('hidden', state.viewFlags.gongcheArchive);
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('checked', Boolean(state.viewFlags[button.dataset.view]));
    button.querySelector('b').textContent = state.viewFlags[button.dataset.view] ? '✓' : '';
  });
  board.classList.toggle('fit-enabled', Boolean(state.gongcheFit));
  document.querySelectorAll('[data-gongche-view]').forEach((button) => {
    const checked = state.viewFlags.gongche && state.gongcheView === button.dataset.gongcheView;
    button.classList.toggle('checked', checked);
    button.querySelector('b').textContent = checked ? '✓' : '';
  });
}

function syncNotationMenu() {
  const activeAction = state.lyricReplacing ? 'replace-lyric' : state.activeTool === 'note' ? 'note-mode' : state.activeTool === 'rhythm' ? 'rhythm-mode' : 'preview-mode';
  ['preview-mode', 'replace-lyric', 'note-mode', 'rhythm-mode'].forEach((action) => {
    const button = document.querySelector(`[data-action="${action}"]`);
    if (!button) return;
    const checked = action === activeAction;
    button.classList.toggle('checked', checked);
    button.querySelector('b').textContent = checked ? '✓' : '';
  });
}

function closeMenus() {
  document.querySelectorAll('.view-dropdown').forEach((menu) => { menu.hidden = true; });
}

function applyPaneWidths() {
  document.querySelectorAll('[data-divider]').forEach((divider) => {
    const width = Number(state.paneWidths?.[divider.dataset.divider]);
    const leftPane = divider.previousElementSibling;
    if (!leftPane || !Number.isFinite(width) || width <= 0) return;
    leftPane.style.flex = `0 0 ${width}px`;
  });
}

document.querySelectorAll('[data-divider]').forEach((divider) => {
  divider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    divider.classList.add('dragging');
    const startX = event.clientX;
    const leftPane = divider.previousElementSibling;
    const rightPane = divider.nextElementSibling;
    const startLeft = leftPane.getBoundingClientRect().width;
    const startRight = rightPane.getBoundingClientRect().width;
    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextLeft = Math.max(180, startLeft + delta);
      const nextRight = Math.max(300, startRight - delta);
      leftPane.style.flex = `0 0 ${nextLeft}px`;
      rightPane.style.flex = '1 1 auto';
    };
    const stop = () => {
      divider.classList.remove('dragging');
      state.paneWidths[divider.dataset.divider] = Math.round(leftPane.getBoundingClientRect().width);
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
    'version: 1',
    'title: 未命名曲谱',
    'meter: 2/4',
    'style: 一板一眼',
    'key: C',
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
  return numberedText ? `${gongcheText}\n\n${numberedText}` : gongcheText;
}

function getArchiveForDownload() {
  return exportArchive();
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
    const printBeat = (groups) => groups.flatMap((group) => group.notes.map((note, noteIndex) => {
      const lyric = note.lyric !== undefined ? note.lyric : '';
      const graceMarks = note.graces?.length ? '√'.repeat(note.graces.length) : '';
      return `${numberedArchiveValue(note)}${graceMarks}{${lyric}}`;
    })).join(' ');
    lines.push(`### 小节${index + 1}`, `第一拍: ${printBeat(bar.first)}`, `第二拍: ${printBeat(bar.second)}`, '');
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
  const bars = [];
  let bar = null;
  source.split('\n').forEach((line) => {
    if (/^###\s+小节/.test(line)) { bar = { first: [], second: [] }; bars.push(bar); return; }
    const match = line.match(/^(第一拍|第二拍):\s*(.*)$/);
    if (!match || !bar) return;
    const groups = [];
    const tokens = match[2].match(/[^\s]+/g) || [];
    tokens.forEach((token) => {
      const tokenMatch = token.match(/^([^{}]+)\{(.*)\}(?:\/d([12]))?$/);
      const rawNumber = tokenMatch ? tokenMatch[1] : token;
      const high = rawNumber.startsWith('^');
      const low = rawNumber.startsWith('_');
      const graceCount = [...rawNumber].filter((char) => char === '√').length;
      const number = rawNumber.replace(/^[_^]+/, '').replace(/√/g, '');
      const char = tokenMatch ? tokenMatch[2] : '';
      groups.push({ char, rowId: `numbered-${bars.length}-${match[1]}-${groups.length}`, notes: [{ number, high, low, gongche: number, char, lyric: char, graces: Array(graceCount).fill('√'), isSubdivision: false }] });
    });
    bar[match[1] === '第一拍' ? 'first' : 'second'] = groups;
  });
  if (!bars.length) throw new Error('简谱存档没有小节');
  return bars;
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
    state.numberedArchiveText = numberedArchiveEditor.value;
    saveState();
    renderScore();
    if (numberedArchivePanel) numberedArchivePanel.hidden = false;
    showToast('简谱存档已保存');
  } catch (error) { showToast(error.message || '简谱存档格式有误'); }
}

function syncArchiveFromState() {
  if (state.archiveEditing) return;
  state.archiveText = exportArchive();
  if (archiveEditor) archiveEditor.value = state.archiveText;
}

function parseArchive(source) {
  const notationStart = source.indexOf('## 工尺谱');
  if (notationStart < 0) throw new Error('缺少“## 工尺谱”段落');
  const numberedStart = source.indexOf('## 简谱', notationStart);
  const notation = source.slice(notationStart, numberedStart < 0 ? source.length : numberedStart).split('\n');
  const columns = [];
  let column = null;
  let columnIndex = -1;
  notation.forEach((line) => {
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
    let token;
    while ((token = tokenPattern.exec(tokenSource))) {
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

function applyArchive(showMessage = false) {
  try {
    if (archiveEditor.value.includes('format: numbered-notation')) {
      state.numberedArchiveText = archiveEditor.value.trim();
      state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
      saveState();
      renderScore();
      if (showMessage) showToast('简谱存档已同步到第二模块');
      return;
    }
    const rows = parseArchive(archiveEditor.value);
    state.rows = rows;
    state.archiveText = archiveEditor.value;
    const numberedStart = archiveEditor.value.indexOf('---\nformat: numbered-notation');
    if (numberedStart >= 0) {
      state.numberedArchiveText = archiveEditor.value.slice(numberedStart).trim();
      state.numberedOverride = parseNumberedArchive(state.numberedArchiveText);
    } else {
      state.numberedArchiveText = '';
      state.numberedOverride = null;
    }
    const parsedLyrics = parseArchiveLyrics(archiveEditor.value);
    state.text = parsedLyrics || rows.map((column) => column.chars.map((row) => row.char).join('')).join('，');
    input.value = state.text;
    saveState();
    renderBoard();
    document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
    if (showMessage) showToast('存档修改已同步');
  } catch (error) {
    if (showMessage) showToast(error.message || '存档格式有误');
  }
}

function copyArchive() {
  const text = archiveEditor.value || exportCombinedArchive();
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
    state.numberedOverride = null;
    state.numberedArchiveText = '';
    renderScore();
    saveState();
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
            <div class="note-stack">${row.notes.map((note, noteIndex) => `<button class="notation-note ${selectedIndex === flattenIndex(columnIndex, charIndex) && selectedNoteIndex === noteIndex && state.activeTool === 'rhythm' ? 'rhythm-target' : ''}" style="--note-index:${noteIndex}" data-note-index="${noteIndex}" data-type="note" title="点击选中工尺字符">${note}</button>`).join('')}</div>
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
  return `<span class="score-note${lowClass}${highClass}${divisionClass}">
    <span class="high-row"><i class="high-dot"></i></span>
    <strong>${graceMarkup}${octavePrefix}${displayNumber}</strong>
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
    if (first.length === 1 && second.length === 1 && first[0].notes.length === 1 && second[0].notes.length === 1) {
      const firstNote = first[0].notes[0];
      const secondNote = second[0].notes[0];
      const sameSource = first[0].rowId === second[0].rowId
        || (firstNote.char && firstNote.char === secondNote.char)
        || ((firstNote.lyric || firstNote.char) && !(secondNote.lyric || secondNote.char));
      if (sameSource && firstNote.number === secondNote.number && (firstNote.lyric || firstNote.char)) {
        secondNote.number = '—';
        secondNote.gongche = '—';
        secondNote.low = false;
        secondNote.high = false;
        secondNote.graces = [];
        secondNote.lyric = '';
        secondNote.char = '';
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
  const renderBeat = (groups) => {
    if (!groups.length) return '<span class="score-empty">·</span>';
    const entries = groups.flatMap((group, groupIndex) => group.notes
      .filter((note, index, all) => index === all.findIndex((item) => item.eventId === note.eventId))
      .map((note, noteIndex) => ({ group, groupIndex, note, noteIndex })));
    const totalNotes = entries.length;
    const renderEntry = (entry, level) => {
      const { group, note, noteIndex } = entry;
      const show = state.numberedOverride
        ? (noteIndex === 0 && note.lyric !== undefined)
        : (noteIndex === 0 && (note.forceLyric || (!note.hideLyric && !renderedLyrics.has(group.rowId))));
      if (show) renderedLyrics.add(group.rowId);
      return groupedScoreMarkup(note, level, show);
    };
    if (totalNotes === 4) {
      const firstPair = entries.slice(0, 2).map((entry) => renderEntry(entry, 0)).join('');
      const secondPair = entries.slice(2, 4).map((entry) => renderEntry(entry, 0)).join('');
      return `<span class="score-four-group"><span class="score-char-group score-pair-group">${firstPair}</span><span class="score-char-group score-pair-group">${secondPair}</span></span>`;
    }
    return entries.map((entry, index) => renderEntry(entry, getArchiveDivisionLevel(groups, entry.groupIndex, entry.noteIndex))).join('');
  };
  const markup = renderedBars.map((bar) => `<div class="score-bar"><div class="score-beat">${renderBeat(bar.first)}</div><div class="score-beat">${renderBeat(bar.second)}</div></div>`).join('');
  const archiveText = state.numberedArchiveText || exportNumberedArchive(renderedBars);
  const archiveView = state.viewFlags.scoreArchive;
  preview.innerHTML = `<div class="score-module-title"><div class="score-module-heading"><strong>简谱</strong><small>由简谱存档渲染</small></div></div>${archiveView ? `<section class="score-archive-view"><div class="archive-toolbar"><span>Numbered Markdown · 编辑后点击保存修改</span><button class="archive-small-button" data-action="save-score-archive">保存修改</button></div><textarea id="score-archive-editor" spellcheck="false">${archiveText}</textarea><p class="archive-hint">修改简谱存档不会反向改动工尺谱。</p></section>` : `<div class="score-line">${markup}</div>`}`;
  numberedArchivePanel = preview.querySelector('.score-archive-view');
  numberedArchiveEditor = preview.querySelector('#score-archive-editor');
  preview.hidden = false;
  if (!archiveView) requestAnimationFrame(markScoreRowEnds);
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
    state.numberedArchiveText = editor.value;
    saveState();
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
  row.char = event.target.value.slice(-1) || row.char;
  state.text = getAllCharacters().map((item) => item.char).join('');
  saveState();
  renderBoard();
});

lyricAttributes.addEventListener('input', (event) => {
  if (!event.target.matches('[data-attribute-char]')) return;
  const row = getCharacterAt(selectedIndex);
  if (!row) return;
  row.char = event.target.value.slice(-1) || row.char;
  event.target.value = row.char;
  state.text = getAllCharacters().map((item) => item.char).join('');
  saveState();
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
    applyArchive(true);
    archivePanel.hidden = false;
  } catch {
    showToast('无法读取存档文件');
  }
});

archiveEditor.addEventListener('focus', () => { state.archiveEditing = true; });
archiveEditor.addEventListener('blur', () => { state.archiveEditing = false; });
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="archive-import"]')) applyArchive(true);
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
  saveState();
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
    saveState();
    renderBoard();
    return;
  }
  if (attributeRhythm) {
    const [noteIndex, rhythmIndex] = attributeRhythm.dataset.attributeRhythm.split(':').map(Number);
    const row = getCharacterAt(selectedIndex);
    const rhythmList = row.noteRhythms[noteIndex] || [];
    rhythmList[rhythmIndex] = keyboardRhythms[String((Number(Object.keys(keyboardRhythms).find((key) => keyboardRhythms[key] === rhythmList[rhythmIndex]) || 1) % 4) + 1)] || '、';
    row.noteRhythms[noteIndex] = rhythmList;
    saveState();
    renderBoard();
    return;
  }
  if (!action) return;
  event.stopPropagation();
  if (action === 'file-menu' || action === 'notation-menu' || action === 'view-menu') {
    const menu = event.target.closest('.view-menu-wrap')?.querySelector('.view-dropdown');
    document.querySelectorAll('.view-dropdown').forEach((item) => { if (item !== menu) item.hidden = true; });
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  if (action === 'gongche-view') {
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
    fitGongcheBoard();
    saveState();
    syncViewFlags();
    renderBoard();
    return;
  }
  if (action === 'preview-mode') {
    state.activeTool = null;
    state.lyricReplacing = false;
    syncToolButtons();
    syncNotationMenu();
    closeMenus();
    showToast('已进入预览模式');
    return;
  }
  if (action === 'new-project') {
    projectBackdrop.hidden = false;
    projectBackdrop.querySelector('[data-project-page="1"]').hidden = false;
    projectBackdrop.querySelector('[data-project-page="2"]').hidden = true;
  }
  if (action === 'project-close') projectBackdrop.hidden = true;
  if (action === 'project-next') {
    projectBackdrop.querySelector('[data-project-page="1"]').hidden = true;
    projectBackdrop.querySelector('[data-project-page="2"]').hidden = false;
  }
  if (action === 'project-create') {
    state.projectMeta = { title: document.querySelector('#project-title').value || '未命名曲谱', author: document.querySelector('#project-author').value, mode: document.querySelector('#project-mode').value };
    state.text = document.querySelector('#project-lyrics').value;
    state.rows = buildRows(state.text);
    state.projectCreated = true;
    input.value = state.text;
    projectBackdrop.hidden = true;
    saveState();
    renderBoard();
    document.querySelector('#char-count').textContent = `${[...state.text].length} 字`;
    showToast('曲谱已创建');
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
    try { localStorage.removeItem(storageKey); } catch {}
    renderBoard();
    document.querySelector('#char-count').textContent = '0 字';
    input.focus();
  }
  if (action === 'note-mode' || action === 'rhythm-mode') {
    const nextTool = action === 'note-mode' ? 'note' : 'rhythm';
    const wasRhythm = state.activeTool === 'rhythm';
    state.activeTool = state.activeTool === nextTool ? null : nextTool;
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
    syncViewFlags();
    renderBoard();
    if (state.activeTool === 'note' && state.gongcheView === 'single') showToast('当前单字已选中，可直接输入工尺');
  }
  if (action === 'replace-lyric') {
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
    if (state.lyricReplacing) {
      renderLyricAttributes();
      document.querySelector('[data-attribute-char]')?.focus();
      document.querySelector('[data-attribute-char]')?.select();
      showToast('当前单字已选中，可直接替换歌词');
    }
  }
  if (action === 'convert') {
    convertToScore();
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
    saveState();
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
  if (action === 'undo' || action === 'redo') showToast(action === 'undo' ? '已撤销上一步操作' : '已恢复上一步操作');
});

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (!viewButton) return;
  const view = viewButton.dataset.view;
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
  saveState();
  renderBoard();
  renderScore();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && tutorialBackdrop && !tutorialBackdrop.hidden) {
    tutorialBackdrop.hidden = true;
  }
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
      }
      else if (state.activeTool === 'note') {
        character.notes.pop();
        character.noteRhythms.pop();
        selectedNoteIndex = Math.max(0, character.notes.length - 1);
      }
      else return;
      saveState();
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
      saveState();
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
      saveState();
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
      saveState();
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

ensureWorkspaceDefaults();
applyPaneWidths();
syncToolButtons();
syncViewFlags();
syncNotationMenu();
convertButton?.addEventListener('click', convertToScore);
