/* Formularz reklamowy: wysyłka do prywatnej skrzynki administratora. */
(function () {
  "use strict";
  var form = document.getElementById("partner-form");
  var feedback = document.getElementById("partner-feedback");
  var sending = false;
  function field(name) { return form.elements.namedItem(name); }
  function status(message, kind) {
    feedback.textContent = message;
    feedback.className = "partner-feedback " + (kind ? "is-" + kind : "");
    feedback.hidden = !message;
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending || !form.reportValidity()) return;
    if (!window.RejsonCloud || typeof window.RejsonCloud.rpc !== "function") {
      status("Nie udało się połączyć z formularzem. Spróbuj ponownie później — treść pozostaje w polach.", "error");
      return;
    }
    var payload = {
      p_name: field("name").value.trim(), p_email: field("email").value.trim(),
      p_kind: field("kind").value, p_message: field("message").value.trim(),
      p_website: field("website").value.trim() || null, p_consent: field("consent").checked
    };
    if (payload.p_message.length < 20 || payload.p_name.length < 2) {
      status("Uzupełnij nazwę i opisz propozycję w co najmniej 20 znakach.", "error");
      return;
    }
    if (payload.p_website && !/^https?:\/\//i.test(payload.p_website)) {
      status("Adres strony musi zaczynać się od http:// lub https://.", "error");
      return;
    }
    sending = true;
    form.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = true; });
    form.setAttribute("aria-busy", "true");
    status("Wysyłam propozycję…", "");
    window.RejsonCloud.rpc("submit_partnership_inquiry", payload, false).then(function (result) {
      if (!result || result.received !== true) throw new Error("Brak potwierdzenia");
      form.reset();
      status("Dziękuję! Propozycja dotarła do panelu Rejsona. Odpowiedź otrzymasz na podany e-mail.", "success");
    }).catch(function (err) {
      var limited = err && /limit wysyłania/i.test(err.message || "");
      status(limited ? "Osiągnięto limit wysyłania. Spróbuj później — treść pozostaje w polach." :
        "Nie mogę potwierdzić wysłania. Sprawdź połączenie i spróbuj ponownie — treść pozostaje w polach.", "error");
    }).finally(function () {
      sending = false;
      form.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = false; });
      form.removeAttribute("aria-busy");
    });
  });
  var menu = document.getElementById("partner-menu"), nav = document.getElementById("partner-nav");
  menu.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
  });
  document.getElementById("partner-theme").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* brak pamięci */ }
  });
})();
