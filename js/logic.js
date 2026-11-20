// Núcleo lógico do Mapa de Karnaugh: layout, minimização exata (Quine–McCluskey + cobertura mínima),
// formatação de termos e leitura de expressões digitadas. Sem dependência do DOM, para poder testar no Node.

export const DEF_VARS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const VCH = ['0', '1', 'X'];
export const MIN_VARS = 2;
export const MAX_VARS = 6;
const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };
const INNER_SPLIT = { 2: [1, 1], 3: [1, 2], 4: [2, 2] };

/**
 * Disposição das células. Até 4 variáveis é um mapa só; com 5 e 6 as variáveis mais significativas
 * escolhem o submapa 4×4 (5 variáveis: 2 submapas lado a lado; 6: grade 2×2 em código Gray).
 * Coordenadas globais (gr, gc) servem para a navegação por teclado.
 */
export function layout(n) {
  const inner = Math.min(n, 4);
  const [rv, cv] = INNER_SPLIT[inner];
  const R = 1 << rv, C = 1 << cv;
  const sb = n - inner;
  const subR = sb === 2 ? 2 : 1;
  const subC = sb >= 1 ? 2 : 1;
  const subs = [];
  for (let s = 0; s < (1 << sb); s++) {
    subs.push({ s, sr: sb === 2 ? (s >> 1) : 0, sc: sb === 2 ? (s & 1) : s });
  }
  const mAt = (s, r, c) => (s << inner) | (GRAY[rv][r] << cv) | GRAY[cv][c];
  const posOf = new Array(1 << n);
  subs.forEach(({ s, sr, sc }) => {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      posOf[mAt(s, r, c)] = { s, r, c, gr: sr * R + r, gc: sc * C + c };
    }
  });
  return { n, inner, rv, cv, R, C, sb, subR, subC, subs, mAt, posOf, rowGray: GRAY[rv], colGray: GRAY[cv] };
}

// ---------- máscaras de até 64 bits em dois inteiros de 32 ----------
const pc32 = x => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
const pcount = (lo, hi) => pc32(lo) + pc32(hi);
const bitOf = i => i < 32 ? [(1 << i) >>> 0, 0] : [0, (1 << (i - 32)) >>> 0];
export function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

/**
 * Minimiza uma função de n variáveis (2 a 6).
 * isTarget[x]: células a cobrir (os 1 para SOP, os 0 para POS). isDc[x]: irrelevantes (X).
 * Cada termo é um cubo {v, m}: m marca as variáveis eliminadas, v os valores fixos nas demais.
 * Critério: menos termos e, no empate, menos literais. A busca é exata; só em casos enormes de 6 variáveis
 * para no limite de nós e devolve a melhor cobertura achada (exact: false).
 */
export function minimize(n, isTarget, isDc, nodeLimit = 250000) {
  const N = 1 << n;
  const ones = [];
  for (let x = 0; x < N; x++) if (isTarget[x]) ones.push(x);
  const empty = { terms: [], primes: [], essentials: [], afterEssentials: [], dcUsed: [], constant: 0, exact: true };
  if (!ones.length) return empty;

  // valid[m*N+v] = 1 se todas as células do cubo (v, m) são alvo ou X. Programação dinâmica pelo bit mais baixo de m.
  const valid = new Uint8Array(N * N);
  for (let v = 0; v < N; v++) valid[v] = (isTarget[v] || isDc[v]) ? 1 : 0;
  for (let m = 1; m < N; m++) {
    const b = m & -m, mm = m ^ b;
    for (let v = 0; v < N; v++) {
      if (v & m) continue;
      valid[m * N + v] = valid[mm * N + v] & valid[mm * N + (v | b)];
    }
  }

  const pos = new Map();
  ones.forEach((x, i) => pos.set(x, i));
  const primes = [];
  for (let m = 0; m < N; m++) for (let v = 0; v < N; v++) {
    if (!valid[m * N + v]) continue;
    let prime = true;
    for (let b = 1; b < N; b <<= 1) {
      if (m & b) continue;
      if (valid[(m | b) * N + (v & ~b)]) { prime = false; break; }
    }
    if (!prime) continue;
    const cells = [];
    let s = m;
    while (true) { cells.push(v | s); if (s === 0) break; s = (s - 1) & m; }
    cells.sort((a, b) => a - b);
    let lo = 0, hi = 0;
    for (const x of cells) if (pos.has(x)) { const [l, h] = bitOf(pos.get(x)); lo |= l; hi |= h; }
    lo >>>= 0; hi >>>= 0;
    if (!lo && !hi) continue;
    primes.push({ v, m, cells, lo, hi, lits: n - popcount(m) });
  }

  const full = primes.find(p => p.m === N - 1);
  if (full) {
    return { terms: [full], primes: [full], essentials: [{ prime: full, because: ones[0] }], afterEssentials: [], dcUsed: full.cells.filter(x => isDc[x]), constant: 1, exact: true };
  }

  const k = ones.length;
  const coversOf = ones.map((_, i) => {
    const [l, h] = bitOf(i);
    return primes.filter(p => (p.lo & l) || (p.hi & h));
  });

  // Essenciais: único primo que cobre algum alvo.
  const essentials = [];
  const essSet = new Set();
  coversOf.forEach((list, i) => {
    if (list.length === 1 && !essSet.has(list[0])) { essSet.add(list[0]); essentials.push({ prime: list[0], because: ones[i] }); }
  });

  let uLo = k >= 32 ? 0xFFFFFFFF : (2 ** k - 1), uHi = k > 32 ? (2 ** (k - 32) - 1) : 0;
  uLo >>>= 0; uHi >>>= 0;
  for (const { prime } of essentials) { uLo = (uLo & ~prime.lo) >>> 0; uHi = (uHi & ~prime.hi) >>> 0; }
  const afterEssentials = ones.filter((_, i) => { const [l, h] = bitOf(i); return (uLo & l) || (uHi & h); });

  // Limite inicial com uma escolha gulosa, depois busca exata com poda.
  const greedy = (lo, hi) => {
    const chosen = []; let lits = 0;
    while (lo || hi) {
      let best = null, bestGain = -1;
      for (const p of primes) {
        const g = pcount((p.lo & lo) >>> 0, (p.hi & hi) >>> 0);
        if (g > bestGain || (g === bestGain && p.lits < best.lits)) { best = p; bestGain = g; }
      }
      chosen.push(best); lits += best.lits;
      lo = (lo & ~best.lo) >>> 0; hi = (hi & ~best.hi) >>> 0;
    }
    return { chosen, lits };
  };
  const base = essentials.map(e => e.prime);
  const baseLits = base.reduce((s, p) => s + p.lits, 0);
  const g = greedy(uLo, uHi);
  let best = { terms: base.concat(g.chosen), len: base.length + g.chosen.length, lits: baseLits + g.lits };
  let nodes = 0, exact = true;
  const chosen = base.slice();
  const rec = (lo, hi, lits) => {
    if (++nodes > nodeLimit) { exact = false; return; }
    if (!lo && !hi) {
      if (chosen.length < best.len || (chosen.length === best.len && lits < best.lits)) {
        best = { terms: chosen.slice(), len: chosen.length, lits };
      }
      return;
    }
    if (chosen.length + 1 > best.len) return;
    if (chosen.length + 1 === best.len && lits + 1 >= best.lits) return;
    let cands = null;
    for (let i = 0; i < k; i++) {
      const [l, h] = bitOf(i);
      if (!((lo & l) || (hi & h))) continue;
      const c = coversOf[i];
      if (!cands || c.length < cands.length) { cands = c; if (c.length === 1) break; }
    }
    const ordered = cands.slice().sort((a, b) =>
      pcount((b.lo & lo) >>> 0, (b.hi & hi) >>> 0) - pcount((a.lo & lo) >>> 0, (a.hi & hi) >>> 0) || a.lits - b.lits);
    for (const p of ordered) {
      chosen.push(p);
      rec((lo & ~p.lo) >>> 0, (hi & ~p.hi) >>> 0, lits + p.lits);
      chosen.pop();
      if (!exact) return;
    }
  };
  rec(uLo, uHi, baseLits);

  const terms = best.terms.slice().sort(termOrder);
  const dcUsed = [...new Set(terms.flatMap(t => t.cells.filter(x => isDc[x])))].sort((a, b) => a - b);
  return { terms, primes: primes.slice().sort(termOrder), essentials, afterEssentials, dcUsed, constant: null, exact };
}

export function termOrder(a, b) { return a.lits - b.lits || b.m - a.m || a.v - b.v; }

/** Analisa as células (0, 1, 2 = X) de um mapa de n variáveis nas duas formas. */
export function analyzeCells(n, cells) {
  const N = 1 << n;
  const one = [], zero = [], dc = [], ones = [], zeros = [], dcs = [];
  for (let x = 0; x < N; x++) {
    const v = cells[x];
    one[x] = v === 1; zero[x] = v === 0; dc[x] = v === 2;
    if (v === 1) ones.push(x); else if (v === 0) zeros.push(x); else dcs.push(x);
  }
  const sop = minimize(n, one, dc);
  const pos = minimize(n, zero, dc);
  assignLayers(sop.terms); assignLayers(pos.terms);
  return { n, sop, pos, ones, zeros, dcs };
}

/** Camadas para desenhar contornos sobrepostos sem que um esconda o outro; cor por índice. */
export function assignLayers(terms) {
  terms.forEach((t, i) => {
    const used = new Set();
    for (let j = 0; j < i; j++) if (terms[j].cells.some(x => t.cells.includes(x))) used.add(terms[j].layer);
    let L = 0;
    while (used.has(L)) L++;
    t.layer = Math.min(L, 5);
    t.color = i % 8;
  });
}

/** Literais de um termo. forPos inverte a leitura (termo-soma de um grupo de zeros). */
export function literals(n, varNames, t, forPos) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = 1 << (n - 1 - i);
    if (t.m & b) continue;
    const bitOne = !!(t.v & b);
    out.push({ name: varNames[i], idx: i, neg: forPos ? bitOne : !bitOne });
  }
  return out;
}

export function termText(n, varNames, t, forPos) {
  const ls = literals(n, varNames, t, forPos);
  const multi = varNames.some(v => v.length > 1);
  if (forPos) {
    const inner = ls.map(l => l.name + (l.neg ? "'" : '')).join(' + ');
    return ls.length > 1 ? `(${inner})` : inner;
  }
  return ls.map(l => l.name + (l.neg ? "'" : '')).join(multi ? '·' : '');
}

/** Texto da expressão mínima, já tratando as constantes. */
export function expressionText(an, varNames, kind) {
  const { n } = an;
  if (!an.ones.length) return '0';
  if (kind === 'sop') {
    if (an.sop.constant === 1) return '1';
    return an.sop.terms.map(t => termText(n, varNames, t, false)).join(' + ');
  }
  if (!an.zeros.length) return '1';
  return an.pos.terms.map(t => termText(n, varNames, t, true)).join('');
}

// ---------- leitura de expressões digitadas (exercícios) ----------

/**
 * Lê expressões como  A'B + C(D + ~E),  !A·B,  (A + B')(C + D),  A̅B.
 * Negação: ' ou ’ ou ̅ depois, ou ~ ! ¬ antes. E: justaposição, · * . &. OU: + |.
 * Devolve uma árvore {t: 'var'|'not'|'and'|'or'|'const'} ou lança Error com mensagem em português.
 */
export function parseExpression(src, varNames) {
  const text = String(src).normalize('NFC');
  if (text.length > 300) throw new Error('A expressão é longa demais.');
  const names = varNames.slice().sort((a, b) => b.length - a.length);
  const caseFold = varNames.every(v => /^[A-Z]$/.test(v));
  const toks = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ("'’′̅".includes(ch)) { toks.push({ k: 'post' }); i++; continue; }
    if ('~!¬'.includes(ch)) { toks.push({ k: 'pre' }); i++; continue; }
    if ('+|∨'.includes(ch)) { toks.push({ k: 'or' }); i++; continue; }
    if ('·*.&∧⋅'.includes(ch)) { toks.push({ k: 'and' }); i++; continue; }
    if (ch === '(' || ch === ')') { toks.push({ k: ch }); i++; continue; }
    if (ch === '0' || ch === '1') { toks.push({ k: 'const', v: ch === '1' }); i++; continue; }
    let matched = null;
    for (const nm of names) {
      const piece = text.substr(i, nm.length);
      if (piece === nm || (caseFold && piece.toUpperCase() === nm)) { matched = nm; break; }
    }
    if (!matched) throw new Error(`Não reconheci "${ch}". Use só as variáveis ${varNames.join(', ')}.`);
    toks.push({ k: 'var', name: matched, idx: varNames.indexOf(matched) });
    i += matched.length;
  }
  if (!toks.length) throw new Error('Digite uma expressão.');
  let p = 0;
  const peek = () => toks[p];
  const startsFactor = t => t && (t.k === 'var' || t.k === 'pre' || t.k === '(' || t.k === 'const');
  function parseOr() {
    const items = [parseAnd()];
    while (peek() && peek().k === 'or') { p++; items.push(parseAnd()); }
    return items.length === 1 ? items[0] : { t: 'or', items };
  }
  function parseAnd() {
    const items = [parseFactor()];
    while (peek() && (peek().k === 'and' || startsFactor(peek()))) {
      if (peek().k === 'and') p++;
      items.push(parseFactor());
    }
    return items.length === 1 ? items[0] : { t: 'and', items };
  }
  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('A expressão terminou no meio. Falta uma variável ou um parêntese?');
    let node;
    if (t.k === 'pre') { p++; node = { t: 'not', item: parseFactor() }; return node; }
    if (t.k === 'var') { p++; node = { t: 'var', idx: t.idx }; }
    else if (t.k === 'const') { p++; node = { t: 'const', v: t.v }; }
    else if (t.k === '(') {
      p++;
      node = parseOr();
      if (!peek() || peek().k !== ')') throw new Error('Falta fechar um parêntese.');
      p++;
    } else if (t.k === ')') throw new Error('Há um ")" sobrando.');
    else throw new Error('Há um operador fora do lugar.');
    while (peek() && peek().k === 'post') { p++; node = { t: 'not', item: node }; }
    return node;
  }
  const tree = parseOr();
  if (p < toks.length) throw new Error(toks[p].k === ')' ? 'Há um ")" sobrando.' : 'Há um operador fora do lugar.');
  return tree;
}

export function evaluate(node, n, x) {
  switch (node.t) {
    case 'var': return ((x >> (n - 1 - node.idx)) & 1) === 1;
    case 'const': return node.v;
    case 'not': return !evaluate(node.item, n, x);
    case 'and': return node.items.every(it => evaluate(it, n, x));
    case 'or': return node.items.some(it => evaluate(it, n, x));
  }
  return false;
}

const isLiteral = nd => nd.t === 'var' || (nd.t === 'not' && nd.item.t === 'var');

/** Estrutura da expressão: forma SOP/POS, número de termos e literais (null se não estiver na forma). */
export function shapeOf(tree) {
  const flat = (nd, type) => nd.t === type ? nd.items.flatMap(it => flat(it, type)) : [nd];
  const sopTerms = flat(tree, 'or');
  const sop = sopTerms.every(tm => flat(tm, 'and').every(isLiteral))
    ? { terms: sopTerms.length, lits: sopTerms.reduce((s, tm) => s + flat(tm, 'and').length, 0) } : null;
  const posTerms = flat(tree, 'and');
  const pos = posTerms.every(tm => flat(tm, 'or').every(isLiteral))
    ? { terms: posTerms.length, lits: posTerms.reduce((s, tm) => s + flat(tm, 'or').length, 0) } : null;
  return { sop, pos };
}

/**
 * Corrige a resposta de um exercício. kind: 'sop' ou 'pos'.
 * Retorna { status: 'erro'|'errada'|'nao-forma'|'nao-minima'|'certa', message, wrong: [mintermos] }.
 */
export function checkAnswer(src, n, varNames, cells, kind) {
  let tree;
  try { tree = parseExpression(src, varNames); } catch (e) { return { status: 'erro', message: e.message, wrong: [] }; }
  const N = 1 << n;
  const wrong = [];
  for (let x = 0; x < N; x++) {
    if (cells[x] === 2) continue;
    if (evaluate(tree, n, x) !== (cells[x] === 1)) wrong.push(x);
  }
  if (wrong.length) {
    return { status: 'errada', wrong, message: `A expressão não bate com o mapa em ${wrong.length} ${wrong.length === 1 ? 'célula' : 'células'}: ${wrong.join(', ')}.` };
  }
  const an = analyzeCells(n, cells);
  const opt = kind === 'sop' ? an.sop : an.pos;
  const constant = !an.ones.length || (kind === 'sop' ? an.sop.constant === 1 : !an.zeros.length);
  const shape = shapeOf(tree)[kind];
  const label = kind === 'sop' ? 'soma de produtos' : 'produto de somas';
  if (constant) return { status: 'certa', wrong, message: 'Certo! A função é constante.' };
  if (!shape) return { status: 'nao-forma', wrong, message: `A expressão está correta, mas não está na forma de ${label}.` };
  const optTerms = opt.terms.length, optLits = opt.terms.reduce((s, t) => s + t.lits, 0);
  if (shape.terms > optTerms || (shape.terms === optTerms && shape.lits > optLits)) {
    return { status: 'nao-minima', wrong, message: `Está correta, mas ainda dá para simplificar: você usou ${shape.terms} ${shape.terms === 1 ? 'termo' : 'termos'} e ${shape.lits} literais; a mínima tem ${optTerms} ${optTerms === 1 ? 'termo' : 'termos'} e ${optLits} literais.` };
  }
  return { status: 'certa', wrong, message: `Certo! É uma ${label} mínima (${optTerms} ${optTerms === 1 ? 'termo' : 'termos'}, ${optLits} literais).` };
}

// ---------- compartilhamento por link ----------

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,2}$/;
const FN_RE = /^[A-Za-z][A-Za-z0-9_]{0,5}$/;

/** Converte um mapa em parâmetros de URL legíveis: ?n=4&f=F&v=A,B,C,D&m=1,3&d=0,2 */
export function mapToParams(map) {
  const cells = map.data[map.n];
  const ones = [], dcs = [];
  cells.forEach((v, i) => { if (v === 1) ones.push(i); else if (v === 2) dcs.push(i); });
  const p = new URLSearchParams();
  p.set('n', String(map.n));
  if (FN_RE.test(map.name || '')) p.set('f', map.name);
  const vars = map.vars.slice(0, map.n);
  if (vars.some((v, i) => v && v !== DEF_VARS[i]) && vars.every(v => !v || NAME_RE.test(v))) p.set('v', vars.map((v, i) => v || DEF_VARS[i]).join(','));
  p.set('m', ones.join(','));
  if (dcs.length) p.set('d', dcs.join(','));
  if (map.view === 'pos') p.set('g', 'pos');
  return p;
}

/**
 * Lê um mapa vindo da URL. Tudo é validado de forma rígida: números inteiros dentro do mapa,
 * nomes curtos só com letras, dígitos e _. Qualquer coisa fora disso é recusada (retorna null).
 */
export function paramsToMap(search) {
  let p;
  try { p = new URLSearchParams(search); } catch (e) { return null; }
  if (!p.has('n') || !p.has('m')) return null;
  const nStr = p.get('n');
  if (!/^[2-6]$/.test(nStr)) return null;
  const n = +nStr, N = 1 << n;
  const list = key => {
    const raw = p.get(key);
    if (raw === null || raw === '') return [];
    if (raw.length > 400 || !/^\d{1,2}(,\d{1,2})*$/.test(raw)) throw new Error('lista inválida');
    const nums = raw.split(',').map(Number);
    if (nums.some(x => x >= N)) throw new Error('fora do mapa');
    return nums;
  };
  let ones, dcs;
  try { ones = list('m'); dcs = list('d'); } catch (e) { return null; }
  if (ones.some(x => dcs.includes(x))) return null;
  const cells = new Array(N).fill(0);
  ones.forEach(x => { cells[x] = 1; });
  dcs.forEach(x => { cells[x] = 2; });
  const f = p.get('f');
  const name = f && FN_RE.test(f) ? f : 'F';
  let vars = DEF_VARS.slice();
  const v = p.get('v');
  if (v) {
    const parts = v.split(',');
    if (parts.length === n && parts.every(x => NAME_RE.test(x)) && new Set(parts).size === n) vars = parts.concat(DEF_VARS.slice(n));
  }
  return { n, name, vars, cells, view: p.get('g') === 'pos' ? 'pos' : 'sop' };
}

/** Lê listas como "1, 3, 7, 11-15" (também aceita colar Σm(…)). */
export function parseList(str, n) {
  const N = 1 << n;
  const out = new Set();
  const clean = String(str).replace(/[^\d,;\s\-]/g, ' ');
  for (const part of clean.split(/[\s,;]+/).filter(Boolean)) {
    const mm = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!mm) throw new Error(`Não entendi "${part}". Use números separados por vírgula, ou intervalos como 4-7.`);
    let a = +mm[1], b = mm[2] != null ? +mm[2] : a;
    if (b < a) [a, b] = [b, a];
    if (b >= N) throw new Error(`O mintermo ${b} não existe num mapa de ${n} variáveis (vai de 0 a ${N - 1}).`);
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}
