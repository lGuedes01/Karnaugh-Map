// Página principal: vários mapas de Karnaugh editáveis, com simplificação em tempo real.
import { DEF_VARS, VCH, MIN_VARS, MAX_VARS, layout, analyzeCells, expressionText, mapToParams, paramsToMap, parseList } from './logic.js';
import { esc, effectiveVars, gridHTML, expressionHTML, stats, stepsHTML, circuitSVG } from './render.js';
import { initTheme, copyText, flashButton } from './common.js';

initTheme();

const FN_NAMES = ['F', 'G', 'H', 'J', 'K', 'L', 'M', 'P', 'Q', 'S', 'T', 'W', 'Y', 'Z'];
const KEY = 'karnaugh-site-v1';
const SIZES = [2, 3, 4, 5, 6];
const mapsEl = document.getElementById('maps');

const newId = () => Math.random().toString(36).slice(2, 10);
const blank = n => new Array(1 << n).fill(0);
const emptyData = () => Object.fromEntries(SIZES.map(k => [k, blank(k)]));

function makeMap(name, n) {
  return { id: newId(), name, n, vars: DEF_VARS.slice(), data: emptyData(), view: 'sop' };
}
function seed() {
  const m = makeMap('F', 4);
  [1, 3, 7, 11, 15].forEach(i => { m.data[4][i] = 1; });
  [0, 2, 5].forEach(i => { m.data[4][i] = 2; });
  return { maps: [m] };
}
function normalize(m) {
  const n = SIZES.includes(m.n) ? m.n : 4;
  const out = makeMap(typeof m.name === 'string' ? m.name.slice(0, 6) : 'F', n);
  if (typeof m.id === 'string' && /^[a-z0-9]{1,12}$/.test(m.id)) out.id = m.id;
  out.vars = DEF_VARS.map((d, i) => (Array.isArray(m.vars) && typeof m.vars[i] === 'string') ? m.vars[i].slice(0, 3) : d);
  SIZES.forEach(k => {
    const src = m.data && Array.isArray(m.data[k]) ? m.data[k] : [];
    out.data[k] = blank(k).map((_, i) => [0, 1, 2].includes(src[i]) ? src[i] : 0);
  });
  out.view = m.view === 'pos' ? 'pos' : 'sop';
  return out;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.maps)) return null;
    return { maps: s.maps.filter(m => m && typeof m === 'object').slice(0, 50).map(normalize) };
  } catch (e) { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sem armazenamento */ } }

let state = load() || seed();

const cellsOf = map => map.data[map.n];
const fnName = map => (map.name || '').trim() || 'F';
const findMap = id => state.maps.find(m => m.id === id);
function nextName() {
  const used = new Set(state.maps.map(fnName));
  return FN_NAMES.find(x => !used.has(x)) || ('F' + (state.maps.length + 1));
}

// ---------- link de compartilhamento recebido ----------
let incomingMessage = null;
if (location.search) {
  const got = paramsToMap(location.search);
  if (got) {
    const m = makeMap(got.name, got.n);
    m.vars = got.vars;
    m.data[got.n] = got.cells;
    m.view = got.view;
    if (state.maps.some(x => x.name === m.name)) m.name = nextName();
    state.maps.unshift(m);
    save();
    incomingMessage = `O mapa ${fnName(m)} do link foi aberto no topo.`;
  } else {
    incomingMessage = 'O link tinha um mapa inválido e foi ignorado.';
  }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
}

// ---------- montagem dos cartões ----------
function resultHTML(map, an, names) {
  const name = esc(fnName(map));
  const stat = s => s ? `${s[0]} ${s[0] === 1 ? 'termo' : 'termos'}, ${s[1]} ${s[1] === 1 ? 'literal' : 'literais'}` : 'constante';
  const sigma = `Σm(${an.ones.join(', ') || '–'})` + (an.dcs.length ? ` + d(${an.dcs.join(', ')})` : '');
  const pi = `ΠM(${an.zeros.join(', ') || '–'})` + (an.dcs.length ? ` · D(${an.dcs.join(', ')})` : '');
  const forms = { sop: 'Soma de produtos (SOP)', pos: 'Produto de somas (POS)' };
  const order = map.view === 'sop' ? ['sop', 'pos'] : ['pos', 'sop'];
  const row = (kind, cls) => {
    const text = `${fnName(map)} = ${expressionText(an, names, kind)}`;
    return `<div class="res-row ${cls}">
      <div class="res-label">${forms[kind]} · ${stat(stats(an, kind))}</div>
      <div class="formula"><span class="fn">${name}</span> <span class="op">=</span> ${expressionHTML(an, names, kind, kind === map.view)}</div>
      <button type="button" class="btn ghost" data-act="copy" data-text="${esc(text)}">Copiar</button>
    </div>`;
  };
  return row(order[0], 'primary') + row(order[1], 'secondary') +
    `<div class="meta"><b>${name}</b> = ${sigma}<br><b>${name}</b> = ${pi}</div>` +
    `<div class="view-row"><span>Grupos no mapa:</span><div class="seg text" role="group" aria-label="Que grupos mostrar">` +
    `<button type="button" data-act="view" data-view="sop" aria-pressed="${map.view === 'sop'}">Uns (SOP)</button>` +
    `<button type="button" data-act="view" data-view="pos" aria-pressed="${map.view === 'pos'}">Zeros (POS)</button></div></div>`;
}

function ttHTML(map, names) {
  const n = map.n, N = 1 << n, cells = cellsOf(map);
  let h = '<table class="tt"><thead><tr><th class="tt-m">m</th>';
  for (let i = 0; i < n; i++) h += `<th>${esc(names[i])}</th>`;
  h += `<th>${esc(fnName(map))}</th></tr></thead><tbody>`;
  for (let x = 0; x < N; x++) {
    h += `<tr><td class="tt-m">${x}</td>`;
    for (let i = 0; i < n; i++) h += `<td>${(x >> (n - 1 - i)) & 1}</td>`;
    h += `<td><button type="button" class="tt-cell" data-m="${x}" data-v="${cells[x]}" aria-label="Linha ${x}, valor ${VCH[cells[x]]}">${VCH[cells[x]]}</button></td></tr>`;
  }
  return h + '</tbody></table>';
}

function cardSkeleton(map) {
  const n = map.n;
  let varInputs = '';
  for (let i = 0; i < n; i++) {
    varInputs += `<label class="sr" for="v-${map.id}-${i}">Nome da variável ${i + 1}</label>` +
      `<input id="v-${map.id}-${i}" data-act="var" data-i="${i}" maxlength="3" value="${esc(map.vars[i])}" placeholder="${DEF_VARS[i]}" autocomplete="off" spellcheck="false">`;
  }
  return `
    <div class="card-head">
      <label class="sr" for="name-${map.id}">Nome da função</label>
      <input class="name-input" id="name-${map.id}" data-act="name" maxlength="6" value="${esc(map.name)}" placeholder="F" autocomplete="off" spellcheck="false">
      <div class="seg" role="group" aria-label="Número de variáveis">
        ${SIZES.map(k => `<button type="button" data-act="n" data-n="${k}" aria-pressed="${k === n}">${k}</button>`).join('')}
      </div>
      <span class="seg-label">variáveis</span>
      <div class="card-actions">
        <button type="button" class="btn ghost" data-act="share">Compartilhar</button>
        <button type="button" class="btn ghost" data-act="dup">Duplicar</button>
        <button type="button" class="btn ghost" data-act="clear">Limpar</button>
        <button type="button" class="btn ghost danger" data-act="remove">Remover</button>
      </div>
    </div>
    <div class="share-row" hidden>
      <label class="sr" for="share-${map.id}">Link deste mapa</label>
      <input class="share-url" id="share-${map.id}" readonly>
      <span class="hint">Quem abrir o link recebe uma cópia deste mapa.</span>
    </div>
    <div class="vars"><span>Variáveis (da mais significativa para a menos):</span>${varInputs}</div>
    <div class="map-wrap"></div>
    <section class="result" aria-label="Expressão simplificada"></section>
    <details class="extra" data-sec="steps"><summary>Passo a passo da simplificação</summary><div class="steps-box"></div></details>
    <details class="extra" data-sec="circ"><summary>Circuito lógico</summary><div class="circ-wrap"></div><p class="note circ-note"></p></details>
    <details class="extra" data-sec="tt"><summary>Tabela verdade</summary><div class="tt-scroll"></div></details>
    <details class="extra" data-sec="qi"><summary>Preencher por lista de mintermos</summary>
      <form class="qi" novalidate>
        <label for="qo-${map.id}">Uns (m)</label>
        <input id="qo-${map.id}" name="ones" placeholder="ex.: 1, 3, 7, 11-15" autocomplete="off">
        <label for="qd-${map.id}">X (d)</label>
        <input id="qd-${map.id}" name="dcs" placeholder="ex.: 0, 2" autocomplete="off">
        <div class="qi-actions">
          <button type="submit" class="btn">Aplicar ao mapa</button>
          <span class="hint">O resto vira 0. Aceita intervalos como 4-7.</span>
          <span class="err" role="alert"></span>
        </div>
      </form>
    </details>`;
}

function updateDynamic(map) {
  const card = mapsEl.querySelector(`.card[data-id="${map.id}"]`);
  if (!card) return;
  const ae = document.activeElement;
  let refocus = null;
  if (ae && card.contains(ae)) {
    if (ae.classList.contains('cell')) refocus = `.cell[data-m="${ae.dataset.m}"]`;
    else if (ae.classList.contains('tt-cell')) refocus = `.tt-cell[data-m="${ae.dataset.m}"]`;
    else if (ae.dataset.act === 'view') refocus = `[data-act="view"][data-view="${ae.dataset.view}"]`;
  }
  const names = effectiveVars(map);
  const an = analyzeCells(map.n, cellsOf(map));
  const groups = map.view === 'sop' ? an.sop.terms : an.pos.terms;
  card.querySelector('.map-wrap').innerHTML = gridHTML(map.n, cellsOf(map), groups, { varNames: names });
  card.querySelector('.result').innerHTML = resultHTML(map, an, names);
  // seções recolhidas só são montadas quando abertas (economiza trabalho em 6 variáveis)
  const sec = s => card.querySelector(`details[data-sec="${s}"]`);
  if (sec('steps').open) card.querySelector('.steps-box').innerHTML = stepsHTML(an, names, map.view, fnName(map));
  if (sec('circ').open) {
    card.querySelector('.circ-wrap').innerHTML = circuitSVG(an, names, map.view, fnName(map));
    card.querySelector('.circ-note').textContent = map.view === 'sop'
      ? 'Soma de produtos: portas E no primeiro nível e uma porta OU na saída. As cores batem com os grupos do mapa.'
      : 'Produto de somas: portas OU no primeiro nível e uma porta E na saída. As cores batem com os grupos do mapa.';
  }
  if (sec('tt').open) card.querySelector('.tt-scroll').innerHTML = ttHTML(map, names);
  const qi = card.querySelector('.qi');
  if (!qi.contains(document.activeElement)) {
    qi.elements.ones.value = an.ones.join(', ');
    qi.elements.dcs.value = an.dcs.join(', ');
  }
  card.classList.toggle('wide', map.n >= 5);
  if (refocus) { const el = card.querySelector(refocus); if (el) el.focus({ preventScroll: true }); }
}

// seções abertas de cada mapa sobrevivem a re-renderizações
const openSecs = new Map();

function renderCard(map) {
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.id = map.id;
  el.setAttribute('aria-label', `Mapa ${fnName(map)}`);
  el.innerHTML = cardSkeleton(map);
  (openSecs.get(map.id) || new Set()).forEach(s => {
    const d = el.querySelector(`details[data-sec="${s}"]`);
    if (d) d.open = true;
  });
  return el;
}

function renderAll() {
  mapsEl.innerHTML = '';
  if (!state.maps.length) {
    mapsEl.innerHTML = '<div class="empty"><span>Nenhum mapa aberto.</span><button type="button" class="btn primary" data-act="add">+ Novo mapa</button></div>';
    return;
  }
  state.maps.forEach(m => { mapsEl.appendChild(renderCard(m)); updateDynamic(m); });
}

function replaceCard(map) {
  const old = mapsEl.querySelector(`.card[data-id="${map.id}"]`);
  const fresh = renderCard(map);
  old.replaceWith(fresh);
  updateDynamic(map);
  return fresh;
}

// ---------- ações ----------
function addMap(afterIndex, source) {
  let m;
  if (source) {
    m = normalize(JSON.parse(JSON.stringify(source)));
    m.id = newId();
    m.name = nextName();
  } else {
    const last = state.maps[state.maps.length - 1];
    m = makeMap(nextName(), last ? Math.min(last.n, 4) : 4);
  }
  const idx = afterIndex == null ? state.maps.length : afterIndex + 1;
  state.maps.splice(idx, 0, m);
  save();
  renderAll();
  const card = mapsEl.querySelector(`.card[data-id="${m.id}"]`);
  if (card) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    card.querySelector('.name-input').focus({ preventScroll: true });
  }
}

let undoState = null, toastTimer = null;
const toast = document.getElementById('toast');
const undoBtn = document.getElementById('toast-undo');
function showToast(msg, withUndo) {
  document.getElementById('toast-msg').textContent = msg;
  undoBtn.hidden = !withUndo;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; undoState = null; }, 7000);
}
undoBtn.addEventListener('click', () => {
  if (undoState) {
    state.maps.splice(Math.min(undoState.index, state.maps.length), 0, undoState.map);
    save();
    renderAll();
  }
  undoState = null;
  toast.hidden = true;
});

function setCell(map, m, v) {
  cellsOf(map)[m] = v;
  save();
  updateDynamic(map);
}

document.getElementById('add-map').addEventListener('click', () => addMap());

mapsEl.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.act === 'add') { addMap(); return; }
  const card = btn.closest('.card');
  if (!card) return;
  const map = findMap(card.dataset.id);
  if (!map) return;

  if (btn.classList.contains('cell') || btn.classList.contains('tt-cell')) {
    const m = +btn.dataset.m;
    setCell(map, m, (cellsOf(map)[m] + 1) % 3);
    return;
  }
  switch (btn.dataset.act) {
    case 'n': {
      const k = +btn.dataset.n;
      if (k !== map.n && k >= MIN_VARS && k <= MAX_VARS) {
        map.n = k;
        save();
        replaceCard(map).querySelector(`[data-act="n"][data-n="${k}"]`).focus();
      }
      break;
    }
    case 'view': map.view = btn.dataset.view === 'pos' ? 'pos' : 'sop'; save(); updateDynamic(map); break;
    case 'clear': map.data[map.n] = blank(map.n); save(); updateDynamic(map); break;
    case 'dup': addMap(state.maps.indexOf(map), map); break;
    case 'remove': {
      const index = state.maps.indexOf(map);
      state.maps.splice(index, 1);
      undoState = { map, index };
      save();
      renderAll();
      showToast(`Mapa ${fnName(map)} removido.`, true);
      break;
    }
    case 'copy':
      copyText(btn.dataset.text).then(ok => flashButton(btn, ok, 'Copiado', 'Copiar'));
      break;
    case 'share': {
      const url = `${location.origin}${location.pathname}?${mapToParams(map).toString()}`;
      const row = card.querySelector('.share-row');
      const input = row.querySelector('.share-url');
      input.value = url;
      row.hidden = false;
      copyText(url).then(ok => {
        flashButton(btn, ok, 'Link copiado', 'Compartilhar');
        if (!ok) { input.focus(); input.select(); }
      });
      break;
    }
  }
});

mapsEl.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.sec) return;
  const card = d.closest('.card');
  const map = card && findMap(card.dataset.id);
  if (!map) return;
  if (!openSecs.has(map.id)) openSecs.set(map.id, new Set());
  openSecs.get(map.id)[d.open ? 'add' : 'delete'](d.dataset.sec);
  if (d.open) updateDynamic(map);
}, true);

mapsEl.addEventListener('contextmenu', e => {
  const btn = e.target.closest('.cell, .tt-cell');
  if (!btn) return;
  e.preventDefault();
  const map = findMap(btn.closest('.card').dataset.id);
  const m = +btn.dataset.m;
  setCell(map, m, (cellsOf(map)[m] + 2) % 3);
});

mapsEl.addEventListener('keydown', e => {
  const btn = e.target.closest('.cell, .tt-cell');
  if (!btn || e.ctrlKey || e.metaKey || e.altKey) return;
  const card = btn.closest('.card');
  const map = findMap(card.dataset.id);
  const m = +btn.dataset.m;
  const set = { '0': 0, '1': 1, x: 2, X: 2, Delete: 0, Backspace: 0 };
  if (e.key in set) {
    e.preventDefault();
    btn.focus();
    setCell(map, m, set[e.key]);
    return;
  }
  if (!btn.classList.contains('cell')) return;
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[e.key]) {
    e.preventDefault();
    const L = layout(map.n);
    const maxR = L.R * L.subR - 1, maxC = L.C * L.subC - 1;
    const r = Math.min(maxR, Math.max(0, +btn.dataset.gr + moves[e.key][0]));
    const c = Math.min(maxC, Math.max(0, +btn.dataset.gc + moves[e.key][1]));
    const next = card.querySelector(`.cell[data-gr="${r}"][data-gc="${c}"]`);
    if (next) next.focus();
  }
});

mapsEl.addEventListener('input', e => {
  const inp = e.target;
  const card = inp.closest('.card');
  if (!card) return;
  const map = findMap(card.dataset.id);
  if (inp.dataset.act === 'name') {
    map.name = inp.value.slice(0, 6);
    card.setAttribute('aria-label', `Mapa ${fnName(map)}`);
    save();
    updateDynamic(map);
  } else if (inp.dataset.act === 'var') {
    map.vars[+inp.dataset.i] = inp.value.trim().slice(0, 3);
    save();
    updateDynamic(map);
  }
});

mapsEl.addEventListener('submit', e => {
  const form = e.target.closest('form.qi');
  if (!form) return;
  e.preventDefault();
  const map = findMap(form.closest('.card').dataset.id);
  const err = form.querySelector('.err');
  try {
    const ones = parseList(form.elements.ones.value, map.n);
    const dcs = parseList(form.elements.dcs.value, map.n);
    const both = [...ones].filter(x => dcs.has(x));
    if (both.length) throw new Error(`${both.join(', ')} aparece${both.length > 1 ? 'm' : ''} nas duas listas. Deixe cada mintermo em uma só.`);
    const cells = blank(map.n);
    ones.forEach(x => { cells[x] = 1; });
    dcs.forEach(x => { cells[x] = 2; });
    map.data[map.n] = cells;
    err.textContent = '';
    save();
    form.querySelector('button[type="submit"]').focus();
    updateDynamic(map);
  } catch (ex) {
    err.textContent = ex.message;
  }
});

// realce do grupo ao passar o mouse (ou focar) um termo
function highlight(target, on) {
  const t = target.closest && target.closest('.term[data-g]');
  if (!t) return;
  const card = t.closest('.card');
  card.querySelectorAll(`.ov[data-g="${t.dataset.g}"], .term[data-g="${t.dataset.g}"]`).forEach(el => el.classList.toggle('hl', on));
}
mapsEl.addEventListener('mouseover', e => highlight(e.target, true));
mapsEl.addEventListener('mouseout', e => highlight(e.target, false));

renderAll();
if (incomingMessage) showToast(incomingMessage, false);
