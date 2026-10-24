// Applies the saved theme before first paint to avoid a flash (external file to satisfy CSP).
(function () {
  try {
    var t = localStorage.getItem('aerotrack-theme');
    var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    // storage blocked: keep the default theme
  }
})();
