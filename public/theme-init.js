// Dark is the default theme; only an explicit saved "light" choice overrides it.
// Runs before first paint to avoid a flash. Key/format are owned by the app (tcg-theme).
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("tcg-theme") || "null");
    var theme = t === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    if (theme === "light") {
      var m = document.getElementById("theme-color");
      if (m) m.setAttribute("content", "#f2ead9");
    }
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
