/* Formularz reklamowy: wysyłka do prywatnej skrzynki administratora. */
(function () {
  "use strict";
  var form = document.getElementById("partner-form");
  var feedback = document.getElementById("partner-feedback");
  var sending = false;
  // Ten sam prywatny formularz przyjmuje też zapytania o stworzenie strony.
  if (new URLSearchParams(location.search).get("temat") === "strona") {
    /* Nowa strona partnerstwa ma inny układ niż stara — każde pole ustawiamy
       tylko wtedy, gdy istnieje. Wcześniej brak jednego elementu przerywał
       cały skrypt i formularz przestawał działać. */
    function set(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.textContent = value;
      return el;
    }
    document.title = "Zapytanie o stronę — Rejson59";
    set(".partner-hero .partner-eyebrow", "✦ TWORZENIE STRON · WSPÓŁPRACA");
    set(".brand-suffix", ".github.io / strony");
    set(".partner-footer span", "Tworzenie stron · Rejson59");
    set(".partner-hero h1", "Masz pomysł na stronę?");
    set(".partner-lead", "Napisz, czego potrzebujesz. Porozmawiajmy o stronie dopasowanej do Ciebie i Twojego pomysłu.");
    set(".partner-hero .partner-primary", "Przejdź do formularza ↗");
    set(".partner-options", "").hidden = true;
    set(".partner-preview-label", "TWOJA STRONA + REJSON59");
    form.elements.namedItem("kind").querySelector('option[value="other"]').textContent = "Stworzenie strony internetowej";
    form.elements.namedItem("kind").value = "other";
    form.elements.namedItem("message").value = "Chcę porozmawiać o stworzeniu strony internetowej.\n";
    var title = document.getElementById("form-title");
    if (title) title.textContent = "Opowiedz mi o swojej stronie.";
    set(".partner-contact-intro > p:not(.partner-eyebrow)",
      "Napisz, czym się zajmujesz i jakiej strony potrzebujesz. Odpowiem na podany adres e-mail — szczegóły i koszty ustalimy wspólnie.");
  }
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
  /* Wspólny topbar zastąpił lokalne menu — elementy mogą nie istnieć. */
  var menu = document.getElementById("partner-menu"), nav = document.getElementById("partner-nav");
  if (menu && nav) menu.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
  });
  var theme = document.getElementById("partner-theme");
  if (theme) theme.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* brak pamięci */ }
  });
})();
