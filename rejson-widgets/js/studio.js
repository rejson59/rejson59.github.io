/* ==========================================================================
   Rejson Widgets — Minimalistyczny Konfigurator Live
   ========================================================================== */

(function () {
  "use strict";

  var WIDGET_URL = "https://rejson59.github.io/rejson-widgets/widget.js";
  var snippetEl = document.getElementById("embed-snippet");
  var copyBtn = document.getElementById("btn-copy");
  var toggleMorphBtn = document.getElementById("btn-test-morph");
  var themeToggle = document.getElementById("theme-toggle");

  var cfg = {
    mode: "pill",
    position: "bottom-right",
    backdrop: "dark"
  };

  function setHostAppearance(backdrop) {
    cfg.backdrop = backdrop;
    if (backdrop === "light") {
      document.documentElement.dataset.theme = "light";
      document.body.dataset.backdrop = "plain";
    } else if (backdrop === "vivid") {
      document.documentElement.dataset.theme = "dark";
      document.body.dataset.backdrop = "vivid";
    } else {
      document.documentElement.dataset.theme = "dark";
      document.body.dataset.backdrop = "plain";
    }
    try {
      localStorage.setItem("theme", document.documentElement.dataset.theme);
    } catch (e) {}
  }

  function updateSnippetAndWidget() {
    var attrs = ['src="' + WIDGET_URL + '"'];
    if (cfg.mode !== "pill") attrs.push('data-mode="' + cfg.mode + '"');
    if (cfg.position !== "bottom-right") attrs.push('data-position="' + cfg.position + '"');
    attrs.push("defer");
    snippetEl.textContent = "<script " + attrs.join(" ") + "></" + "script>";

    if (window.RejsonWidget) {
      window.RejsonWidget.configure({
        mode: cfg.mode,
        position: cfg.position
      });
    }
  }

  document.querySelectorAll("[data-opt-group]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.dataset.optGroup;
      var val = btn.dataset.optVal;
      document.querySelectorAll('[data-opt-group="' + group + '"]').forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      if (group === "backdrop") {
        setHostAppearance(val);
      } else {
        cfg[group] = val;
        updateSnippetAndWidget();
      }
    });
  });

  themeToggle.addEventListener("click", function () {
    var isLight = document.documentElement.dataset.theme === "light";
    setHostAppearance(isLight ? "dark" : "light");
    document.querySelectorAll('[data-opt-group="backdrop"]').forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.optVal === cfg.backdrop);
    });
  });

  copyBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(snippetEl.textContent).then(function () {
      copyBtn.textContent = "Skopiowano";
      setTimeout(function () {
        copyBtn.textContent = "Kopiuj";
      }, 1600);
    });
  });

  toggleMorphBtn.addEventListener("click", function () {
    if (window.RejsonWidget) window.RejsonWidget.toggle();
  });

  window.addEventListener("DOMContentLoaded", updateSnippetAndWidget);
})();
