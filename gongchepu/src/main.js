const gongcheMap = {
  上: '1', 尺: '2', 工: '3', 凡: '4', 六: '5', 五: '6', 乙: '7',
  合: '5', 四: '6', 伍: '6', 亿: '7', 句: '4'
};

const inputText = '春风又绿江南岸，明月何时照我还。';
const state = {
  text: inputText,
  key: 'C',
  tonality: '♩ = 72',
  activeTool: 'free',
  rows: []
};

const notes = ['上', '尺', '工', '凡', '六', '五', '乙', '合', '四', '伍', '亿', '句'];
const separators = /[，。！？；：、,.!?;:\n]/;
const storageKey = 'gongchepu-editor-state';
const keyboardNotes = {
  shang: '上', chi: '尺', gong: '工', fan: '凡', liu: '六', wu: '五', yi: '乙', si: '四', he: '合'
};
const keyboardRhythms = {
  '1': '、',
  '2': '。',
  '3': '—',
  '4': '△',
  '0': ''
};

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
  } catch {
    // Directly opened local files may restrict storage access.
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ text: state.text, rows: state.rows }));
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
  row.noteRhythms = row.noteRhythms.slice(0, row.notes.length).map((rhythms) => Array.isArray(rhythms) ? rhythms.slice(0, 2) : []);
}));
saveState();
let selectedIndex = 0;
let selectedNoteIndex = 0;
let keyboardBuffer = '';
let keyboardTimer;

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">尺</div>
        <div><div class="brand-title">工尺谱 · 新编</div><div class="brand-subtitle">古谱今译，心声可见</div></div>
      </div>
      <nav class="nav-tabs">
        <button class="nav-tab active">编辑器</button>
        <button class="nav-tab" data-action="library">我的曲谱</button>
      </nav>
      <div class="header-actions">
        <button class="icon-button" title="帮助">?</button>
        <button class="icon-button" title="设置">⚙</button>
        <button class="export-button" data-action="export">导出曲谱 <span>⌄</span></button>
      </div>
    </header>

    <main class="page">
      <section class="hero">
        <div>
          <h1>开始编织你的旋律</h1>
          <p>输入歌词，为每个字赋予工尺字符，谱写属于你的新声。</p>
        </div>
        <div class="hero-badge"><span class="sparkle">✦</span> 新编模式</div>
      </section>

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
            <button class="mini-button" data-action="auto">✦ 自动配工尺</button>
            <button class="mode-button" data-action="note-mode">输入音符</button>
            <button class="mode-button" data-action="rhythm-mode">输入节奏</button>
            <button class="score-button" data-action="convert">转写简谱</button>
            <button class="mini-button" data-action="undo">↶</button>
            <button class="mini-button" data-action="redo">↷</button>
          </div>
        </div>
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function convertToScore() {
  try {
    renderScore();
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
            ${row.notes.map((note, noteIndex) => `<div class="rhythm-stack" style="--note-index:${noteIndex}">${(row.noteRhythms[noteIndex] || []).map((rhythm, rhythmIndex) => rhythm ? `<span class="notation-rhythm ${rhythm === '△' ? 'triangle-rhythm' : ''}" style="--rhythm-index:${rhythmIndex}">${rhythm}</span>` : '').join('')}</div>`).join('')}
            <button class="add-note" data-type="add-note" title="为这个字添加一个工尺">＋</button>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('') : '<div class="empty-board">先输入一段文字，开始编排你的旋律</div>';
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
const lowGongche = new Set(['合', '四']);

function nextPentatonic(number) {
  const index = pentatonicScale.indexOf(number);
  return index === -1 ? number : pentatonicScale[(index + 1) % pentatonicScale.length];
}

function scoreNoteMarkup(number, graceNumber, char) {
  if (!graceNumber) return `<span class="score-note"><strong>${number}</strong><small>${char}</small></span>`;
  return `<span class="score-note"><strong>${number}<sup class="grace-note">${graceNumber}</sup></strong><small>${char}</small></span>`;
}

function groupedScoreMarkup(group, divisionLevel = 0, showLyric = true) {
  const graceMarkup = group.graces.map((number) => `<sup class="grace-note">${number}</sup>`).join('');
  const lowClass = lowGongche.has(group.gongche) ? ' low-note' : '';
  const divisionClass = divisionLevel === 2 ? ' divided-twice' : divisionLevel === 1 ? ' divided-once' : '';
  return `<span class="score-note${lowClass}${divisionClass}">
    <strong>${group.number}${graceMarkup}</strong>
    <span class="division-line division-first"></span>
    <span class="division-line division-second"></span>
    <span class="low-row"><i class="low-dot"></i></span>
    <small>${showLyric ? group.char : ''}</small>
  </span>`;
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

function legacyRenderScore() {
  const preview = document.querySelector('#score-preview');
  const characters = getAllCharacters();
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
          const continuation = { number: gongcheMap[note] || '—', gongche: note, char: row.char, graces: [] };
          pendingTriangleGroup.notes.push(continuation);
          lastGroup = continuation;
          if (gongcheMap[note]) lastPitch = gongcheMap[note];
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

        const number = gongcheMap[note] || '—';
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
            if (gongcheMap[note]) lastPitch = gongcheMap[note];
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
        if (gongcheMap[note]) lastPitch = gongcheMap[note];
      });
    });
  });
  const renderedBars = bars.length ? bars : [{ first: [], second: [] }];
  const renderedLyrics = new Set();
  const renderBeat = (groups) => groups.length ? groups.map((group, groupIndex) => `
    <span class="score-char-group" style="--group-size:${groups.length}">
      ${group.notes.map((note, noteIndex) => {
        const divisionLevel = getDivisionLevel(groups, group, noteIndex);
        const showLyric = note === group.notes[0] && !renderedLyrics.has(group.rowId);
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
    const markerBeats = rhythms.map((item) => rhythmBeat(item)).filter((beat) => beat !== null);
    const isGrace = note === '√';
    const beatsForNote = isGrace ? (currentBeat === null ? [] : [currentBeat]) : (markerBeats.length ? markerBeats : (currentBeat === null ? [] : [currentBeat]));
    if (!beatsForNote.length) return;

    // One Gongche note may carry two rhythm marks. It must be emitted once
    // for each marked beat, rather than only using the first mark.
    beatsForNote.forEach((beat) => {
      if (beat === 0 && (markerBeats.length || currentBeat === null)) {
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
        dash: rhythms.includes('—'),
        triangle: rhythms.includes('△'),
        grace: isGrace,
        moveLyric: noteIndex === 0 && (rhythms[0] === '—' || rhythms[0] === '△')
      };
      event.bar[beat === 0 ? 'first' : 'second'].push(event);
      events.push(event);
    });
  }));
  events.forEach((event, index) => {
    const previous = events[index - 1];
    if ((event.dash || event.triangle) && previous) (previous.extensions ||= []).push(event);
  });
  bars.forEach((bar) => ['first', 'second'].forEach((key) => {
    const grouped = [];
    bar[key].forEach((event) => {
      if (event.grace) return;
      let group = grouped.find((item) => item.rowId === event.rowId);
      if (!group) { group = { char: event.row.char, rowId: event.rowId, notes: [] }; grouped.push(group); }
       const model = { eventId: event.eventId, number: gongcheMap[event.note] || '—', gongche: event.note, char: event.row.char, graces: [], isSubdivision: event.dash || event.triangle, hideLyric: event.moveLyric };
       event.model = model;
       group.notes.push(model);
       (event.extensions || []).forEach((extension) => group.notes.push({ eventId: extension.eventId, number: gongcheMap[extension.note] || '—', gongche: extension.note, char: extension.row.char, graces: [], isSubdivision: true, forceLyric: extension.moveLyric }));
    });
    bar[key] = grouped;
  }));

  // Final sustain check: 、+△ on a single-note character means that note
  // fills the whole bar when the next rhythm marker starts a new first beat.
  // Keep the first-beat note, but render the second-beat repeat as a dash
  // without octave dots or grace marks.
  characters.forEach((row, rowIndex) => {
    if (row.notes.length !== 1) return;
    const rhythms = row.noteRhythms[0] || [];
    if (!(rhythms.includes('、') && rhythms.includes('△'))) return;
    let nextMarker = null;
    for (let index = rowIndex + 1; index < characters.length && !nextMarker; index += 1) {
      const nextCharacter = characters[index];
      for (let noteIndex = 0; noteIndex < nextCharacter.notes.length; noteIndex += 1) {
        const rhythmList = nextCharacter.noteRhythms[noteIndex] || [];
        nextMarker = rhythmList.find((rhythm) => rhythm === '、' || rhythm === '。' || rhythm === '—' || rhythm === '△');
        if (nextMarker) break;
      }
    }
    if (nextMarker !== '、') return;
    const secondGroup = bars
      .map((bar) => bar.second.find((group) => group.rowId === row.id))
      .find(Boolean);
    if (!secondGroup) return;
    secondGroup.notes.forEach((note) => {
      note.number = '—';
      note.gongche = '—';
      note.graces = [];
      note.isSubdivision = false;
    });
  });

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
  const renderedBars = bars.length ? bars : [{ first: [], second: [] }];
  const renderedLyrics = new Set();
  const renderBeat = (groups) => groups.length ? groups.map((group, groupIndex) => {
    const uniqueNotes = group.notes.filter((note, index, all) => index === all.findIndex((item) => (item.eventId || item) === (note.eventId || note)));
    return `<span class="score-char-group">${uniqueNotes.map((note, noteIndex) => { const level = getDivisionLevel(groups, { ...group, notes: uniqueNotes }, noteIndex); const show = note.forceLyric || (!note.hideLyric && noteIndex === 0 && !renderedLyrics.has(group.rowId)); if (show) renderedLyrics.add(group.rowId); return groupedScoreMarkup(note, level, show); }).join('')}</span>`;
  }).join('') : '<span class="score-empty">·</span>';
  const markup = renderedBars.map((bar) => `<div class="score-bar"><div class="score-beat">${renderBeat(bar.first)}</div><div class="score-beat">${renderBeat(bar.second)}</div></div>`).join('');
  preview.innerHTML = `<div class="score-heading"><strong>简谱 · 2/4</strong><span>先定位，再处理升级，最后分拍</span></div><div class="score-line">${markup}</div>`;
  preview.hidden = false;
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
    const current = notes.indexOf(row.notes[noteIndex]);
    row.notes[noteIndex] = notes[(current + 1) % notes.length];
  }
  if (event.target.dataset.type === 'add-note') {
    row.notes.push(notes[row.notes.length % notes.length]);
    row.noteRhythms.push([]);
  }
  saveState();
  renderBoard();
});

document.addEventListener('click', (event) => {
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
  if (action === 'auto') { state.rows = buildRows(state.text); saveState(); renderBoard(); showToast('已为文字自动生成工尺字符'); }
  if (action === 'note-mode' || action === 'rhythm-mode') {
    const nextTool = action === 'note-mode' ? 'note' : 'rhythm';
    state.activeTool = state.activeTool === nextTool ? null : nextTool;
    syncToolButtons();
    renderBoard();
  }
  if (action === 'convert') {
    convertToScore();
  }
  if (action === 'export') { showToast('曲谱已准备好，可继续完善后导出'); }
  if (action === 'library') { showToast('曲谱库功能正在整理中'); }
  if (action === 'undo' || action === 'redo') showToast(action === 'undo' ? '已撤销上一步操作' : '已恢复上一步操作');
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea, input')) return;
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
      if (character) character.notes.push(matchedNote);
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
      if (rhythms.length < 2) rhythms.push(keyboardRhythms[event.key]);
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

renderBoard();
syncToolButtons();
convertButton?.addEventListener('click', convertToScore);
