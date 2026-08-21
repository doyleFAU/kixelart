(function () {
  var theme = localStorage.getItem("kixelart-theme");
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
