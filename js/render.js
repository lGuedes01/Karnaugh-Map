// Geração de HTML/SVG compartilhada entre as páginas. Sem estilos inline: tudo por classes,
// para a Política de Segurança de Conteúdo poder proibir CSS e JS embutidos.
(function (K) {
'use strict';
const {layout, literals, VCH, DEF_VARS} = K;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bits = (x, k) => x.toString(2).padStart(k, '0');

/** Nomes efetivos das variáveis (campo vazio usa o padrão). */
const effectiveVars = map => DEF_VARS.map((d, i) => ((map.vars[i] || '').trim() || d));

/**
 * HTML do mapa. groups: termos {cells, layer, color} a contornar.
 * opts: { readonly, marks: Set de mintermos a destacar como erro, varNames }
 */
function gridHTML(n, cells, groups, opts = {}) {
  const L = layout(n);
  const names = opts.varNames || DEF_VARS;
  const multi = names.slice(0, n).some(v => v.length > 1);
  const sep = multi ? ',' : '';
  const { R, C, rv, cv, inner } = L;
  const ovs = {};
  groups.forEach((g, gi) => {
    L.subs.forEach(({ s }) => {
      const sub = g.cells.filter(x => L.posOf[x].s === s);
      if (!sub.length) return;
      const inG = new Set(sub);
      const rows = new Set(sub.map(x => L.posOf[x].r)), cols = new Set(sub.map(x => L.posOf[x].c));
      const fullR = rows.size === R, fullC = cols.size === C;
      sub.forEach(x => {
        const { r, c } = L.posOf[x];
        const side = (inGrid, nb, full, wrapNb) => inGrid ? (inG.has(nb) ? 'o' : 'c') : ((full || !inG.has(wrapNb)) ? 'c' : 'e');
        const t = side(r > 0, r > 0 && L.mAt(s, r - 1, c), fullR, L.mAt(s, R - 1, c));
        const b = side(r < R - 1, r < R - 1 && L.mAt(s, r + 1, c), fullR, L.mAt(s, 0, c));
        const l = side(c > 0, c > 0 && L.mAt(s, r, c - 1), fullC, L.mAt(s, r, C - 1));
        const rr = side(c < C - 1, c < C - 1 && L.mAt(s, r, c + 1), fullC, L.mAt(s, r, 0));
        (ovs[x] = ovs[x] || []).push(`<span class="ov g${g.color} L${g.layer} t${t} r${rr} b${b} l${l}" data-g="${gi}"></span>`);
      });
    });
  });

  const rowLabel = names.slice(L.sb, L.sb + rv).map(esc).join(sep);
  const colLabel = names.slice(L.sb + rv, n).map(esc).join(sep);
  const subLabel = s => {
    if (!L.sb) return '';
    const vs = names.slice(0, L.sb).map(esc).join(sep);
    return `<div class="sub-title">${vs} = ${bits(s, L.sb)}</div>`;
  };
  const cellTag = opts.readonly ? 'div' : 'button type="button"';
  const cellEnd = opts.readonly ? 'div' : 'button';
  let h = `<div class="submaps sc${L.subC}${n >= 5 ? ' big' : ''}">`;
  for (const { s } of L.subs) {
    h += `<div class="submap">${subLabel(s)}<div class="kmap c${C} r${R}">`;
    h += `<div class="corner" aria-hidden="true"><span class="cv">${colLabel}</span><span class="rv">${rowLabel}</span></div>`;
    for (let c = 0; c < C; c++) h += `<div class="ch" aria-hidden="true">${bits(L.colGray[c], cv)}</div>`;
    for (let r = 0; r < R; r++) {
      h += `<div class="rh" aria-hidden="true">${bits(L.rowGray[r], rv)}</div>`;
      for (let c = 0; c < C; c++) {
        const m = L.mAt(s, r, c), v = cells[m], p = L.posOf[m];
        const assign = names.slice(0, n).map((nm, i) => `${nm}=${(m >> (n - 1 - i)) & 1}`).join(', ');
        const mark = opts.marks && opts.marks.has(m) ? ' wrong' : '';
        h += `<${cellTag} class="cell${mark}" data-m="${m}" data-gr="${p.gr}" data-gc="${p.gc}" data-v="${v}" ` +
          `aria-label="Mintermo ${m} (${esc(assign)}), valor ${VCH[v]}">` +
          `<span class="mi" aria-hidden="true">${m}</span><span class="val">${VCH[v]}</span>${(ovs[m] || []).join('')}</${cellEnd}>`;
      }
    }
    h += '</div></div>';
  }
  return h + '</div>';
}

const litHTML = l => l.neg ? `<span class="neg">${esc(l.name)}</span>` : esc(l.name);

/** Termo em HTML. */
function termHTML(n, names, t, forPos) {
  const ls = literals(n, names, t, forPos);
  if (forPos) {
    const inner = ls.map(litHTML).join('<span class="op"> + </span>');
    return ls.length > 1 ? `(${inner})` : inner;
  }
  return ls.map(litHTML).join(names.slice(0, n).some(v => v.length > 1) ? '·' : '');
}

/** Lado direito da expressão em HTML; termos coloridos (com data-g) quando active. */
function expressionHTML(an, names, kind, active) {
  const { n } = an;
  if (!an.ones.length) return '<span class="const">0</span>';
  if (kind === 'sop' && an.sop.constant === 1) return '<span class="const">1</span>';
  if (kind === 'pos' && !an.zeros.length) return '<span class="const">1</span>';
  const res = kind === 'sop' ? an.sop : an.pos;
  const parts = res.terms.map((t, i) => {
    const attrs = active ? ` class="term g${t.color}" data-g="${i}"` : ' class="term"';
    return `<span${attrs}>${termHTML(n, names, t, kind === 'pos')}</span>`;
  });
  return kind === 'sop' ? parts.join('<span class="op"> + </span>') : parts.join('');
}

function stats(an, kind) {
  const res = kind === 'sop' ? an.sop : an.pos;
  const constant = !an.ones.length || (kind === 'sop' ? an.sop.constant === 1 : !an.zeros.length);
  if (constant) return null;
  return [res.terms.length, res.terms.reduce((s, t) => s + t.lits, 0)];
}

const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;

/** Explicação passo a passo da simplificação. */
function stepsHTML(an, names, kind, fname) {
  const { n } = an;
  const res = kind === 'sop' ? an.sop : an.pos;
  const forPos = kind === 'pos';
  const alvo = forPos ? '0' : '1';
  const nm = esc(fname);
  const code = t => `<code class="t">${termHTML(n, names, t, forPos)}</code>`;
  const list = xs => xs.join(', ');

  if (!an.ones.length) return `<p>Não há nenhum 1 no mapa, então <b>${nm} = 0</b> para qualquer entrada.</p>`;
  if (kind === 'sop' && res.constant === 1) return `<p>Todas as células são 1 ou X. Um único grupo cobre o mapa inteiro, então <b>${nm} = 1</b>.</p>`;
  if (forPos && !an.zeros.length) return `<p>Não há nenhum 0 no mapa, então <b>${nm} = 1</b>.</p>`;

  const essSet = new Set(res.essentials.map(e => e.prime));
  const used = new Set(res.terms);
  let h = '<ol class="steps">';
  h += `<li><b>Grupos possíveis (implicantes primos).</b> São os maiores retângulos de ${forPos ? 'zeros' : 'uns'} (e X), ` +
    `com 1, 2, 4, 8… células, que não cabem dentro de um grupo maior. As bordas do mapa se tocam. ` +
    `${forPos ? 'Cada grupo de zeros vira um termo-soma com as variáveis invertidas: a variável que vale 0 no grupo aparece normal, a que vale 1 aparece barrada. ' : 'No termo ficam só as variáveis que não mudam dentro do grupo. '}` +
    `Há ${plural(res.primes.length, 'grupo', 'grupos')}:<ul class="primes">`;
  for (const p of res.primes) {
    const tags = (essSet.has(p) ? '<span class="chip ess">essencial</span>' : '') + (used.has(p) ? '<span class="chip use">usado</span>' : '');
    h += `<li>${code(p)} <span class="cov">células ${list(p.cells)}</span> ${tags}</li>`;
  }
  h += '</ul></li>';

  if (res.essentials.length) {
    h += `<li><b>Essenciais.</b> Um grupo é essencial quando é o único que cobre algum ${alvo}; ele entra obrigatoriamente.<ul>`;
    for (const e of res.essentials) h += `<li>${code(e.prime)}: é o único que cobre a célula ${e.because}.</li>`;
    h += '</ul></li>';
  } else {
    h += `<li><b>Essenciais.</b> Nenhum: todo ${alvo} é coberto por pelo menos dois grupos, então é preciso escolher.</li>`;
  }

  const extra = res.terms.filter(t => !essSet.has(t));
  if (!res.afterEssentials.length) {
    h += `<li><b>Cobertura.</b> Os essenciais já cobrem todos os ${alvo}s. Nenhum outro grupo é necessário.</li>`;
  } else {
    h += `<li><b>Cobertura.</b> ${res.essentials.length ? `Depois dos essenciais ainda faltam as células ${list(res.afterEssentials)}.` : `Falta cobrir as células ${list(res.afterEssentials)}.`} ` +
      `A escolha com menos grupos (e, no empate, menos literais) é ${extra.map(code).join(' e ')}.</li>`;
  }

  if (an.dcs.length) {
    const unused = an.dcs.filter(x => !res.dcUsed.includes(x));
    const u = res.dcUsed;
    h += `<li><b>Irrelevantes (X).</b> ` +
      (u.length === 1 ? `O X da célula ${u[0]} entrou num grupo para deixá-lo maior. `
        : u.length ? `Os X das células ${list(u)} entraram em grupos para deixá-los maiores. `
          : 'Nenhum X ajudou a aumentar um grupo. ') +
      (unused.length === 1 ? `O X da célula ${unused[0]} ficou de fora.`
        : unused.length ? `Os X das células ${list(unused)} ficaram de fora.` : '') + '</li>';
  }
  h += `<li><b>Resultado.</b> <span class="formula small"><span class="fn">${nm}</span> = ${expressionHTML(an, names, kind, false)}</span></li>`;
  h += '</ol>';
  if (!res.exact) h += '<p class="note">A busca pela cobertura parou no limite de tempo. A expressão está correta, mas pode existir outra com menos termos.</p>';
  return h;
}

// ---------- circuito ----------

function andPath(x, y, w, h) {
  const r = h / 2;
  return `M${x},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x} Z`;
}
function orPath(x, y, w, h) {
  return `M${x},${y} Q${x + w * 0.35},${y + h / 2} ${x},${y + h} Q${x + w * 0.62},${y + h} ${x + w},${y + h / 2} Q${x + w * 0.62},${y} ${x},${y} Z`;
}
const orBackX = (x, y, w, h, yi) => { const t = (yi - y) / h; return x + 2 * t * (1 - t) * w * 0.35; };

/** Circuito em dois níveis (AND→OR para SOP, OR→AND para POS) em SVG. */
function circuitSVG(an, names, kind, fname) {
  const { n } = an;
  const forPos = kind === 'pos';
  const nm = esc(fname);
  if (!an.ones.length) return `<p class="note">${nm} = 0: a saída fica ligada direto no nível lógico 0, sem portas.</p>`;
  if ((!forPos && an.sop.constant === 1) || (forPos && !an.zeros.length)) return `<p class="note">${nm} = 1: a saída fica ligada direto no nível lógico 1, sem portas.</p>`;
  const terms = (forPos ? an.pos : an.sop).terms;
  const lits = terms.map(t => literals(n, names, t, forPos));

  const usedPlain = new Set(), usedNeg = new Set();
  lits.forEach(ls => ls.forEach(l => (l.neg ? usedNeg : usedPlain).add(l.idx)));
  const rails = [];
  let x = 24;
  const railX = {};
  for (let i = 0; i < n; i++) {
    if (!usedPlain.has(i) && !usedNeg.has(i)) continue;
    railX[i] = { plain: x, neg: usedNeg.has(i) ? x + 22 : null };
    rails.push(i);
    x += usedNeg.has(i) ? 58 : 34;
  }
  const gateX = x + 18;
  const STEP = 14;
  let y = 92;
  const gates = lits.map(ls => {
    const k = ls.length;
    const h = k === 1 ? 20 : Math.max(28, k * STEP + 6);
    const g = { y, h, k, ls };
    y += h + 14;
    return g;
  });
  const bottom = y - 14;
  const w1 = Math.max(46, gates.reduce((m, g) => Math.max(m, g.h / 2 + 18), 0));
  const T = gates.length;
  const firstTop = gates[0].y, lastBot = gates[T - 1].y + gates[T - 1].h;
  const midY = (firstTop + lastBot) / 2;
  const x2 = gateX + w1 + 26 + Math.min(T, 16) * 7;
  const H2 = Math.max(36, T * STEP + 8);
  const y2 = midY - H2 / 2;
  const w2 = Math.max(50, H2 / 2 + 18);

  let svg = '';
  // trilhos de entrada
  for (const i of rails) {
    const { plain, neg } = railX[i];
    svg += `<text class="lbl" x="${plain}" y="16" text-anchor="middle">${esc(names[i])}</text>`;
    svg += `<path class="wire" d="M${plain},24 V${bottom}"/>`;
    if (neg !== null) {
      svg += `<path class="wire" d="M${plain},34 H${neg} V42"/><circle class="dot" cx="${plain}" cy="34" r="2.6"/>`;
      svg += `<path class="notg" d="M${neg - 8},42 H${neg + 8} L${neg},58 Z"/><circle class="notg" cx="${neg}" cy="62" r="4"/>`;
      svg += `<path class="wire" d="M${neg},66 V${bottom}"/>`;
    }
  }
  const outEnds = [];
  gates.forEach((g, j) => {
    const color = terms[j].color;
    const cy = g.y + g.h / 2;
    if (g.k === 1) {
      const l = g.ls[0];
      const rx = l.neg ? railX[l.idx].neg : railX[l.idx].plain;
      svg += `<path class="wire" d="M${rx},${cy} H${gateX + w1}"/><circle class="dot" cx="${rx}" cy="${cy}" r="2.6"/>`;
      outEnds.push(cy);
      return;
    }
    svg += `<path class="gate g${color}" d="${forPos ? orPath(gateX, g.y, w1, g.h) : andPath(gateX, g.y, w1, g.h)}"/>`;
    g.ls.forEach((l, q) => {
      const yi = g.y + g.h * (q + 1) / (g.k + 1);
      const rx = l.neg ? railX[l.idx].neg : railX[l.idx].plain;
      const ex = forPos ? orBackX(gateX, g.y, w1, g.h, yi) : gateX;
      svg += `<path class="wire" d="M${rx},${yi} H${ex}"/><circle class="dot" cx="${rx}" cy="${yi}" r="2.6"/>`;
    });
    outEnds.push(cy);
  });

  if (T === 1) {
    const cy = outEnds[0];
    svg += `<path class="wire" d="M${gateX + w1},${cy} H${gateX + w1 + 30}"/>`;
    svg += `<text class="lbl out" x="${gateX + w1 + 36}" y="${cy + 5}">${nm}</text>`;
    const width = gateX + w1 + 36 + 14 * nm.length + 10;
    return `<svg class="circ" viewBox="0 0 ${width} ${bottom + 16}" width="${width}" role="img" aria-label="Circuito lógico de ${nm}">${svg}</svg>`;
  }

  // segundo nível: fios com "degrau" escalonado para não se cruzarem
  const ins = gates.map((_, j) => y2 + H2 * (j + 1) / (T + 1));
  const up = [], down = [];
  outEnds.forEach((cy, j) => { if (cy < ins[j] - 0.5) up.push(j); else if (cy > ins[j] + 0.5) down.push(j); });
  const midX = {};
  up.forEach((j, u) => { midX[j] = x2 - 12 - u * 7; });
  down.slice().reverse().forEach((j, d) => { midX[j] = x2 - 12 - d * 7; });
  outEnds.forEach((cy, j) => {
    const ex = forPos ? x2 : orBackX(x2, y2, w2, H2, ins[j]);
    if (midX[j] === undefined) svg += `<path class="wire" d="M${gateX + w1},${cy} H${ex}"/>`;
    else svg += `<path class="wire" d="M${gateX + w1},${cy} H${midX[j]} V${ins[j]} H${ex}"/>`;
  });
  svg += `<path class="gate g2nd" d="${forPos ? andPath(x2, y2, w2, H2) : orPath(x2, y2, w2, H2)}"/>`;
  svg += `<path class="wire" d="M${x2 + w2},${midY} H${x2 + w2 + 28}"/>`;
  svg += `<text class="lbl out" x="${x2 + w2 + 34}" y="${midY + 5}">${nm}</text>`;
  const width = x2 + w2 + 34 + 14 * nm.length + 10;
  const height = Math.max(bottom, y2 + H2) + 16;
  return `<svg class="circ" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-label="Circuito lógico de ${nm} com ${T} portas no primeiro nível">${svg}</svg>`;
}

Object.assign(K, { esc, effectiveVars, gridHTML, termHTML, expressionHTML, stats, stepsHTML, circuitSVG });
})(globalThis.Karnaugh = globalThis.Karnaugh || {});
