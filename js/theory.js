// Página de teoria: desenha os mapas de exemplo com os grupos da solução mínima.
(function (K) {
'use strict';
const {DEF_VARS, analyzeCells, mapToParams} = K;
const {gridHTML, expressionHTML} = K;
const {initTheme} = K;

initTheme();

const nums = s => (s || '').split(',').filter(Boolean).map(Number);

document.querySelectorAll('.figmap').forEach(el => {
  const n = +el.dataset.n;
  const kind = el.dataset.kind === 'pos' ? 'pos' : 'sop';
  const cells = new Array(1 << n).fill(0);
  nums(el.dataset.m).forEach(x => { cells[x] = 1; });
  nums(el.dataset.d).forEach(x => { cells[x] = 2; });
  const an = analyzeCells(n, cells);
  const groups = kind === 'sop' ? an.sop.terms : an.pos.terms;
  const map = { n, name: 'F', vars: DEF_VARS.slice(), data: { [n]: cells }, view: kind };
  el.innerHTML = `<div class="map-wrap">${gridHTML(n, cells, groups, { readonly: true, varNames: DEF_VARS })}</div>
    <div class="answer-row">
      <span class="formula small"><span class="fn">F</span> <span class="op">=</span> ${expressionHTML(an, DEF_VARS, kind, true)}</span>
      <a class="btn ghost" href="index.html?${mapToParams(map).toString()}">Abrir na ferramenta</a>
    </div>`;
});

// realce do grupo ao passar o mouse sobre um termo
function highlight(target, on) {
  const t = target.closest && target.closest('.term[data-g]');
  if (!t) return;
  const fig = t.closest('.figmap');
  fig.querySelectorAll(`.ov[data-g="${t.dataset.g}"], .term[data-g="${t.dataset.g}"]`).forEach(x => x.classList.toggle('hl', on));
}
document.addEventListener('mouseover', e => highlight(e.target, true));
document.addEventListener('mouseout', e => highlight(e.target, false));
})(globalThis.Karnaugh = globalThis.Karnaugh || {});
