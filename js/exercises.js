// Página de exercícios: gera mapas aleatórios e corrige a expressão digitada.
(function (K) {
'use strict';
const {DEF_VARS, analyzeCells, checkAnswer, mapToParams} = K;
const {gridHTML, expressionHTML, stepsHTML} = K;
const {initTheme} = K;

initTheme();

const KEY = 'karnaugh-exercicios-v1';
const $ = id => document.getElementById(id);
const opts = { n: 4, kind: 'sop', dc: true };
const score = { ok: 0, total: 0, streak: 0 };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && typeof s === 'object') {
    if ([2, 3, 4, 5].includes(s.n)) opts.n = s.n;
    if (s.kind === 'pos') opts.kind = 'pos';
    if (s.dc === false) opts.dc = false;
    ['ok', 'total', 'streak'].forEach(k => { if (Number.isInteger(s[k]) && s[k] >= 0) score[k] = s[k]; });
  }
} catch (e) { /* sem armazenamento */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...opts, ...score })); } catch (e) { /* ignora */ } };

let ex = null; // { n, kind, cells, an, number, counted, solved, hintLevel }
let number = 0;

function generate(n, withDc) {
  const N = 1 << n;
  for (let tries = 0; tries < 200; tries++) {
    const pOne = 0.3 + Math.random() * 0.25;
    const pDc = withDc ? 0.08 + Math.random() * 0.1 : 0;
    const cells = Array.from({ length: N }, () => { const r = Math.random(); return r < pOne ? 1 : r < pOne + pDc ? 2 : 0; });
    const an = analyzeCells(n, cells);
    if (an.ones.length < 2 || an.zeros.length < 2) continue;
    const res = opts.kind === 'sop' ? an.sop : an.pos;
    const lits = res.terms.reduce((s, t) => s + t.lits, 0);
    if (res.terms.length < 2 || lits < 3) continue;
    if (n >= 4 && res.terms.length > (n === 5 ? 6 : 5)) continue;
    if (withDc && !an.dcs.length) continue;
    return { cells, an };
  }
  const cells = Array.from({ length: N }, (_, i) => (i % 3 === 0 ? 1 : 0));
  return { cells, an: analyzeCells(n, cells) };
}

function renderMap(groups = [], marks) {
  $('ex-map').innerHTML = gridHTML(ex.n, ex.cells, groups, { readonly: true, marks, varNames: DEF_VARS });
}

function newExercise() {
  number++;
  const { cells, an } = generate(opts.n, opts.dc);
  ex = { n: opts.n, kind: opts.kind, cells, an, counted: false, solved: false, hintLevel: 0 };
  const vars = DEF_VARS.slice(0, ex.n).join(', ');
  $('ex-title').textContent = `Exercício ${number}`;
  $('ex-kind').textContent = ex.kind === 'sop' ? 'soma de produtos' : 'produto de somas';
  $('ex-prompt').textContent = `Variáveis ${vars}. Escreva F como ${ex.kind === 'sop' ? 'soma de produtos (agrupe os 1)' : 'produto de somas (agrupe os 0)'} com o menor número de termos e de literais.`;
  renderMap();
  $('feedback').hidden = true;
  $('solution').hidden = true;
  $('answer').value = '';
  $('hint-btn').textContent = 'Dica';
  const map = { n: ex.n, name: 'F', vars: DEF_VARS.slice(), data: { [ex.n]: ex.cells }, view: ex.kind };
  $('open-tool').href = `index.html?${mapToParams(map).toString()}`;
}

function showFeedback(cls, html) {
  const fb = $('feedback');
  fb.className = `feedback ${cls}`;
  fb.innerHTML = html;
  fb.hidden = false;
}

function updateScore() {
  $('sc-ok').textContent = score.ok;
  $('sc-total').textContent = score.total;
  $('sc-streak').textContent = score.streak;
}

function countAttempt(correct) {
  if (ex.counted) return;
  ex.counted = true;
  score.total++;
  if (correct) { score.ok++; score.streak++; } else score.streak = 0;
  save();
  updateScore();
}

function revealSolution() {
  const res = ex.kind === 'sop' ? ex.an.sop : ex.an.pos;
  renderMap(res.terms);
  $('sol-formula').innerHTML = `<span class="fn">F</span> <span class="op">=</span> ${expressionHTML(ex.an, DEF_VARS, ex.kind, true)}`;
  $('sol-steps').innerHTML = stepsHTML(ex.an, DEF_VARS, ex.kind, 'F');
  $('solution').hidden = false;
}

$('ex-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!ex) return;
  const r = checkAnswer($('answer').value, ex.n, DEF_VARS, ex.cells, ex.kind);
  const msg = document.createElement('span');
  msg.textContent = r.message;
  if (r.status === 'erro') { showFeedback('bad', `<b>Não consegui ler a expressão.</b> ${msg.innerHTML}`); return; }
  if (r.status === 'errada') {
    renderMap([], new Set(r.wrong));
    showFeedback('bad', `<b>Ainda não.</b> ${msg.innerHTML} As células erradas estão marcadas em vermelho.`);
    countAttempt(false);
    return;
  }
  renderMap();
  if (r.status === 'certa') {
    ex.solved = true;
    showFeedback('ok', `<b>${msg.innerHTML}</b> Clique em “Próximo exercício” para continuar.`);
    countAttempt(true);
    revealSolution();
    return;
  }
  showFeedback('warn', `<b>Quase.</b> ${msg.innerHTML}`);
  countAttempt(false);
});

$('hint-btn').addEventListener('click', () => {
  if (!ex) return;
  const res = ex.kind === 'sop' ? ex.an.sop : ex.an.pos;
  const lits = res.terms.reduce((s, t) => s + t.lits, 0);
  ex.hintLevel++;
  if (ex.hintLevel === 1) {
    showFeedback('warn', `<b>Dica 1.</b> A resposta mínima tem ${res.terms.length} termos e ${lits} literais no total.`);
    $('hint-btn').textContent = 'Outra dica';
  } else {
    const ess = res.essentials.length ? res.essentials[0].prime : res.terms[0];
    const idx = res.terms.indexOf(ess);
    renderMap([res.terms[idx]]);
    showFeedback('warn', `<b>Dica 2.</b> Um dos grupos da resposta está contornado no mapa${res.essentials.length ? ` (é essencial: é o único que cobre a célula ${res.essentials[0].because})` : ''}.`);
    $('hint-btn').disabled = true;
  }
});
$('reveal-btn').addEventListener('click', () => {
  if (!ex) return;
  if (!ex.solved) countAttempt(false);
  revealSolution();
});
$('next-btn').addEventListener('click', () => { $('hint-btn').disabled = false; newExercise(); $('answer').focus(); });
$('reset-score').addEventListener('click', () => { score.ok = 0; score.total = 0; score.streak = 0; save(); updateScore(); });

function bindSeg(id, attr, apply) {
  const seg = $(id);
  const sync = () => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(apply.get()))));
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    apply.set(b.dataset[attr]);
    save();
    sync();
    $('hint-btn').disabled = false;
    newExercise();
  });
  sync();
}
bindSeg('opt-n', 'n', { get: () => opts.n, set: v => { opts.n = +v; } });
bindSeg('opt-kind', 'kind', { get: () => opts.kind, set: v => { opts.kind = v === 'pos' ? 'pos' : 'sop'; } });
bindSeg('opt-dc', 'dc', { get: () => (opts.dc ? 1 : 0), set: v => { opts.dc = v === '1'; } });

updateScore();
newExercise();
})(globalThis.Karnaugh = globalThis.Karnaugh || {});
