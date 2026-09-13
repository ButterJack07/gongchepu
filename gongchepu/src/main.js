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
  numberedView: 'score'
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
  } catch {
    // Directly opened local files may restrict storage access.
  }
}

function saveState() {
  if (!state.archiveEditing) state.archiveText = exportArchive();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ text: state.text, rows: state.rows, archiveText: state.archiveText, numberedArchiveText: state.numberedArchiveText, numberedOverride: state.numberedOverride }));
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
      <div class="header-actions">
        <div class="archive-header-actions"><button class="tutorial-button" data-action="tutorial">教程</button><button class="import-button" data-action="archive-upload">导入存档</button><button class="export-button" data-action="export">导出存档 <span>↓</span></button></div>
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

    <main class="page">
      <section class="editor-card">
        <div class="card-header">
          <div class="step-label"><span>01</span> 输入歌词</div>
          <div class="text-tools"><span id="char-count">${[...state.text].length} 字</span><button class="clear-button" data-action="clear">清空</button></div>
        </div>
        <div class="text-entry-wrap">
          <textarea id="lyric-input" spellcheck="false" aria-label="歌词输入">${state.text}</textarea>
          <div class="textarea-hint">输入文字后，在下方为每个字添加工尺字符</div>
        </div>

        <div class="card-header mapping-header">
          <div class="step-label"><span>02</span> 编排工尺谱</div>
          <div class="mapping-tools">
            <button class="mode-button" data-action="note-mode">输入音符</button>
            <button class="mode-button" data-action="rhythm-mode">输入节奏</button>
            <button class="score-button" data-action="convert">转写简谱</button>
            <button class="archive-button" data-action="archive-toggle">工尺存档</button>
            <button class="mini-button" data-action="undo">↶</button>
            <button class="mini-button" data-action="redo">↷</button>
          </div>
        </div>
        <section class="archive-panel" id="archive-panel" hidden>
          <div class="archive-toolbar">
            <span>Gongche Markdown · 编辑后点击保存修改</span>
            <button class="archive-small-button" data-action="archive-import">保存修改</button>
          </div>
          <textarea id="archive-editor" spellcheck="false" aria-label="Gongche Markdown 存档编辑器"></textarea>
          <p class="archive-hint">像 LaTeX 一样编辑存档；每个工尺最多三个节奏，格式错误会保留在编辑器中。</p>
        </section>
        <section class="archive-panel numbered-archive-panel" id="numbered-archive-panel" hidden>
          <div class="archive-toolbar"><span>Numbered Markdown · 独立简谱数据</span><button class="archive-small-button" data-action="numbered-save">保存修改</button></div>
          <textarea id="numbered-archive-editor" spellcheck="false" aria-label="简谱存档编辑器"></textarea>
          <p class="archive-hint">编辑这里不会修改工尺存档；简谱视图会根据本存档重新渲染。</p>
        </section>
        <input id="archive-file-input" type="file" accept=".txt,text/plain" hidden />
        <div class="notation-board" id="notation-board"></div>
        <div class="notation-footer"><span><i class="status-dot"></i> 已自动保存</span><span>点击右侧工尺可切换，点击 ＋ 可继续添加</span></div>
        <div class="score-preview" id="score-preview" hidden></div>
      </section>
      <footer class="footer-note"><span>◒</span> 工尺谱 · 传承千年的记谱方式</footer>
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
const numberedArchivePanel = document.querySelector('#numbered-archive-panel');
const numberedArchiveEditor = document.querySelector('#numbered-archive-editor');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
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
  const renderColumns = state.rows.map((column, columnIndex) => ({
    column,
    columnIndex,
    chars: column.chars.map((row, charIndex) => ({ row, charIndex }))
      .filter(({ charIndex }) => state.activeTool !== 'rhythm' || flattenIndex(columnIndex, charIndex) === selectedIndex)
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
  syncArchiveFromState();
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
    if (!numberedArchivePanel.hidden && document.activeElement !== numberedArchiveEditor) numberedArchiveEditor.value = state.numberedArchiveText;
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
  const archiveView = state.numberedView === 'archive';
  preview.innerHTML = `<div class="score-module-title"><div class="score-module-heading"><span>03</span><strong>简谱</strong><small>由简谱存档渲染</small></div><div class="score-view-actions"><button class="archive-small-button" data-action="toggle-numbered-view">${archiveView ? '简谱视图' : '简谱存档视图'}</button></div></div>${archiveView ? `<section class="score-archive-view"><textarea id="score-archive-editor" spellcheck="false">${archiveText}</textarea><button class="archive-small-button" data-action="save-score-archive">保存简谱存档修改</button></section>` : `<div class="score-line">${markup}</div>`}`;
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
  state.text = event.target.value;
  syncRows();
});

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
  if (!action) return;
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
    state.activeTool = state.activeTool === nextTool ? null : nextTool;
    syncToolButtons();
    renderBoard();
  }
  if (action === 'convert') {
    convertToScore();
  }
  if (action === 'archive-toggle') {
    archivePanel.hidden = !archivePanel.hidden;
    if (!archivePanel.hidden) archiveEditor.value = state.archiveText || exportArchive();
  }
  if (action === 'numbered-toggle') {
    numberedArchivePanel.hidden = !numberedArchivePanel.hidden;
    if (!numberedArchivePanel.hidden) {
      if (!state.numberedArchiveText) renderScore();
      numberedArchiveEditor.value = state.numberedArchiveText;
    }
  }
  if (action === 'numbered-save') saveNumberedArchive();
  if (action === 'toggle-numbered-view') toggleNumberedView();
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && tutorialBackdrop && !tutorialBackdrop.hidden) {
    tutorialBackdrop.hidden = true;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea, input')) return;
  if (event.key === 'Shift') {
    shiftHeld = true;
    return;
  }
  if (event.key === 'CapsLock') {
    capsLockHeld = true;
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
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

renderBoard();
syncToolButtons();
convertButton?.addEventListener('click', convertToScore);
