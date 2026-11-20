// Testes da lógica: rode com  node tests/logic.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// js/logic.js é um script comum (funciona até abrindo o site direto do arquivo); aqui ele roda num contexto isolado.
const ctx = vm.createContext({ URLSearchParams });
vm.runInContext(fs.readFileSync(new URL('../js/logic.js', import.meta.url), 'utf8'), ctx);
const {
  minimize, analyzeCells, expressionText, parseExpression, evaluate, checkAnswer,
  paramsToMap, mapToParams, parseList, layout, DEF_VARS,
} = ctx.Karnaugh;

let passed = 0;
const test = (name, fn) => { fn(); passed++; };

const run = (n, ones, dcs = []) => {
  const N = 1 << n;
  const t = [], d = [];
  for (let x = 0; x < N; x++) { t[x] = ones.includes(x); d[x] = dcs.includes(x); }
  return minimize(n, t, d);
};
const cellsFrom = (n, ones, dcs = []) => {
  const c = new Array(1 << n).fill(0);
  ones.forEach(x => { c[x] = 1; }); dcs.forEach(x => { c[x] = 2; });
  return c;
};

// Cobertura mínima por força bruta (para conferir a busca em 2 a 4 variáveis).
function bruteBest(n, ones, dcs) {
  const r = run(n, ones, dcs);
  if (!ones.length) return { len: 0, lits: 0 };
  const P = r.primes;
  let best = null;
  for (let mask = 1; mask < (1 << P.length); mask++) {
    let len = 0, lits = 0;
    const cov = new Set();
    for (let i = 0; i < P.length; i++) if (mask & (1 << i)) { len++; lits += P[i].lits; P[i].cells.forEach(x => cov.add(x)); }
    if (best && (len > best.len)) continue;
    if (!ones.every(x => cov.has(x))) continue;
    if (!best || len < best.len || (len === best.len && lits < best.lits)) best = { len, lits };
  }
  return best;
}

test('exemplos clássicos', () => {
  const an = analyzeCells(4, cellsFrom(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]));
  assert.equal(an.sop.terms.length, 3);
  assert.equal(expressionText(an, DEF_VARS, 'sop'), "CD' + B'C' + A'BD");
  assert.equal(expressionText(analyzeCells(4, cellsFrom(4, [0, 2, 8, 10])), DEF_VARS, 'sop'), "B'D'");
  assert.equal(expressionText(analyzeCells(3, cellsFrom(3, [0, 1, 2, 3, 4, 5, 6, 7])), DEF_VARS, 'sop'), '1');
  assert.equal(expressionText(analyzeCells(3, cellsFrom(3, [])), DEF_VARS, 'sop'), '0');
  assert.equal(expressionText(analyzeCells(3, cellsFrom(3, [0, 2, 4, 6], [7])), DEF_VARS, 'pos'), "C'");
});

test('cobre exatamente os 1 e respeita os X (2 a 6 variáveis, aleatório)', () => {
  for (let n = 2; n <= 6; n++) {
    const N = 1 << n;
    const trials = n <= 4 ? 2000 : 150;
    for (let k = 0; k < trials; k++) {
      const ones = [], dcs = [];
      for (let x = 0; x < N; x++) { const r = Math.random(); if (r < 0.4) ones.push(x); else if (r < 0.55) dcs.push(x); }
      const res = run(n, ones, dcs);
      for (let x = 0; x < N; x++) {
        if (dcs.includes(x)) continue;
        const cov = res.terms.some(t => (x & ~t.m) === t.v);
        assert.equal(cov, ones.includes(x), `n=${n} x=${x}`);
      }
    }
  }
});

test('é mínima (compara com força bruta em 2 a 4 variáveis)', () => {
  for (let n = 2; n <= 4; n++) {
    const N = 1 << n;
    for (let k = 0; k < 300; k++) {
      const ones = [], dcs = [];
      for (let x = 0; x < N; x++) { const r = Math.random(); if (r < 0.45) ones.push(x); else if (r < 0.6) dcs.push(x); }
      const res = run(n, ones, dcs);
      if (res.primes.length > 18) continue;
      const b = bruteBest(n, ones, dcs);
      const lits = res.terms.reduce((s, t) => s + t.lits, 0);
      assert.equal(res.terms.length, b.len);
      assert.equal(lits, b.lits);
    }
  }
});

test('6 variáveis no pior caso termina rápido', () => {
  const ones = [];
  for (let x = 0; x < 64; x++) if (((x ^ (x >> 1) ^ (x >> 2) ^ (x >> 3) ^ (x >> 4) ^ (x >> 5)) & 1) === 0) ones.push(x);
  const t0 = Date.now();
  const res = run(6, ones);
  assert.equal(res.terms.length, 32);
  const dcHeavy = [];
  for (let x = 0; x < 64; x++) if (x % 3 === 0) dcHeavy.push(x);
  run(6, [1, 2, 4, 8, 16, 32, 7, 11, 13, 14, 19, 21, 22, 25, 26, 28, 35, 37, 38, 41, 42, 44, 49, 50, 52, 56], dcHeavy);
  assert.ok(Date.now() - t0 < 3000);
});

test('leitura de expressões', () => {
  const V = ['A', 'B', 'C', 'D'];
  const cases = [
    ["A'B + C", x => (!((x >> 3) & 1) && ((x >> 2) & 1)) || ((x >> 1) & 1)],
    ['~a b + !c d', x => (!((x >> 3) & 1) && ((x >> 2) & 1)) || (!((x >> 1) & 1) && (x & 1))],
    ["(A + B')(C + D)", x => (((x >> 3) & 1) || !((x >> 2) & 1)) && (((x >> 1) & 1) || (x & 1))],
    ["(AB)'", x => !(((x >> 3) & 1) && ((x >> 2) & 1))],
    ['A̅·B', x => !((x >> 3) & 1) && ((x >> 2) & 1)],
  ];
  for (const [src, f] of cases) {
    const tree = parseExpression(src, V);
    for (let x = 0; x < 16; x++) assert.equal(evaluate(tree, 4, x), !!f(x), `${src} x=${x}`);
  }
  assert.throws(() => parseExpression('A + (B', V), /parêntese/);
  assert.throws(() => parseExpression('A + Z', V), /reconheci/);
  assert.throws(() => parseExpression('', V), /Digite/);
});

test('correção de exercícios', () => {
  const cells = cellsFrom(4, [1, 3, 7, 11, 15], [0, 2, 5]);
  assert.equal(checkAnswer("CD + A'B'", 4, DEF_VARS, cells, 'sop').status, 'certa');
  assert.equal(checkAnswer("CD + A'D", 4, DEF_VARS, cells, 'sop').status, 'certa');
  assert.equal(checkAnswer("ACD + A'CD + A'B'D", 4, DEF_VARS, cells, 'sop').status, 'nao-minima');
  assert.equal(checkAnswer('CD', 4, DEF_VARS, cells, 'sop').status, 'errada');
  assert.equal(checkAnswer("D(C + A')", 4, DEF_VARS, cells, 'sop').status, 'nao-forma');
  assert.equal(checkAnswer("D(C + A')", 4, DEF_VARS, cells, 'pos').status, 'certa');
  assert.equal(checkAnswer('A +', 4, DEF_VARS, cells, 'sop').status, 'erro');
});

test('link de compartilhamento: ida e volta e validação', () => {
  const map = { n: 4, name: 'G', vars: ['A', 'B', 'C', 'D', 'E', 'F'], data: { 4: cellsFrom(4, [1, 3], [0]) }, view: 'pos' };
  const back = paramsToMap('?' + mapToParams(map).toString());
  assert.deepEqual([...back.cells], map.data[4]);
  assert.equal(back.name, 'G');
  assert.equal(back.view, 'pos');
  assert.equal(paramsToMap('?n=4&m=1,99'), null);
  assert.equal(paramsToMap('?n=9&m=1'), null);
  assert.equal(paramsToMap('?n=4&m=1&d=1'), null);
  assert.equal(paramsToMap('?n=4&m=1,2<script>'), null);
  const evil = paramsToMap('?n=2&m=1&f=<img>&v=<b>,x');
  assert.equal(evil.name, 'F');
  assert.deepEqual([...evil.vars.slice(0, 2)], ['A', 'B']);
});

test('lista de mintermos e layout', () => {
  assert.deepEqual([...parseList('Σm(1, 3, 5-7)', 3)].sort(), [1, 3, 5, 6, 7]);
  assert.throws(() => parseList('16', 4), /não existe/);
  for (let n = 2; n <= 6; n++) {
    const L = layout(n);
    const seen = new Set();
    L.posOf.forEach((p, m) => { assert.ok(p); seen.add(m); });
    assert.equal(seen.size, 1 << n);
  }
});

console.log(`${passed} grupos de testes passaram.`);
