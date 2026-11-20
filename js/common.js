// Comportamentos comuns a todas as páginas: botão de tema e cópia para a área de transferência.
(function (K) {
'use strict';
const KEY = 'karnaugh-theme';
const LABELS = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' };

function initTheme() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  let mode = 'auto';
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') mode = t; } catch (e) { /* ignora */ }
  const apply = () => {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    btn.textContent = LABELS[mode];
    try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch (e) { /* ignora */ }
  };
  btn.addEventListener('click', () => {
    mode = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
    apply();
  });
  apply();
}

/** Copia texto; usa a API moderna e, se falhar, um campo temporário. Devolve uma Promise<boolean>. */
function copyText(text) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'sr';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
  } catch (e) { /* cai no fallback */ }
  return Promise.resolve(fallback());
}

function flashButton(btn, ok, okText = 'Copiado', restore) {
  const original = restore || btn.textContent;
  btn.textContent = ok ? okText : 'Não deu para copiar';
  setTimeout(() => { btn.textContent = original; }, 1600);
}

Object.assign(K, { initTheme, copyText, flashButton });
})(globalThis.Karnaugh = globalThis.Karnaugh || {});
