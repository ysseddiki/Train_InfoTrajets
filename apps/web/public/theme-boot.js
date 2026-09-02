/*
 * Amorçage exécuté avant le paint. Ce fichier est externe (et non un <script> inline)
 * pour que la CSP de production puisse interdire `script-src 'unsafe-inline'`.
 *
 * Servi tel quel depuis `public/` : pas de bundling, garder du JS compatible navigateur.
 */
(function () {
  /* Thème clair par défaut, appliqué avant le paint pour éviter un flash. */
  try {
    var t = localStorage.getItem("sncf.theme");
    if (t !== "dark" && t !== "light") t = "light";
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }

  /* Webfonts chargées en non-bloquant : media="print" au parse, "all" une fois prêtes. */
  var link = document.getElementById("webfonts");
  if (!link) return;
  var enable = function () {
    link.media = "all";
  };
  if (link.sheet) {
    enable();
  } else {
    link.addEventListener("load", enable, { once: true });
  }
})();
