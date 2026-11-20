// Aplica o tema salvo antes da página aparecer (evita piscar). Arquivo separado por causa da CSP.
(function () {
  try {
    var t = localStorage.getItem('karnaugh-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sem armazenamento: segue o tema do sistema */ }
})();
