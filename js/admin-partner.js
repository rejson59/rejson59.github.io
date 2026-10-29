/* Prywatna skrzynka partnerstwa — wyłącznie po uwierzytelnieniu admina. */
(function () {
  "use strict";
  var list = document.getElementById("partner-admin-list");
  var busy = false;
  var labels = {banner: "Baner reklamowy", card: "Wyróżniona karta", other: "Inna współpraca", undecided: "Jeszcze nie wiem"};
  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function rpc(fn, args) { return window.RejsonCloud.rpc(fn, args || {}, true); }
  function button(label, cls, fn) {
    var el = node("button", "btn btn-glass btn-sm", label);
    el.type = "button";
    if (cls) el.classList.add(cls);
    el.addEventListener("click", function () { fn(el); });
    return el;
  }
  function action(id, op, trigger, error) {
    if (op === "delete" && !window.confirm("Usunąć tę wiadomość o partnerstwie? Tej operacji nie można cofnąć.")) return;
    trigger.disabled = true;
    error.textContent = "";
    rpc("admin_partnership_action", {p_id: id, p_action: op}).then(function (ok) {
      if (ok !== true) throw new Error("Wiadomość nie istnieje lub nie została zmieniona.");
      return load();
    }).catch(function () {
      error.textContent = "Nie udało się wykonać operacji. Spróbuj ponownie.";
      trigger.disabled = false;
    });
  }
  function render(items) {
    list.replaceChildren();
    if (!items.length) { list.appendChild(node("div", "adm-empty", "Nie ma jeszcze żadnych zapytań o partnerstwo.")); return; }
    items.forEach(function (item) {
      var card = node("article", "partner-admin-card");
      var head = node("div", "partner-admin-head");
      head.appendChild(node("h3", "", item.name || "Bez nazwy"));
      head.appendChild(node("span", "partner-admin-status", item.status === "new" ? "● NOWE" : "PRZECZYTANE"));
      card.appendChild(head);
      var when = new Date(item.created_at);
      card.appendChild(node("p", "partner-admin-meta", (isNaN(when) ? "—" : when.toLocaleString("pl-PL")) + " · " + (labels[item.kind] || "Współpraca")));
      var email = node("a", "partner-admin-contact", item.email || "");
      email.href = "mailto:" + encodeURIComponent(item.email || "") + "?subject=" + encodeURIComponent("Rejson59 — współpraca");
      card.appendChild(email);
      if (item.website) card.appendChild(node("p", "partner-admin-meta", "Strona: " + item.website));
      card.appendChild(node("p", "partner-admin-message", item.message || ""));
      var error = node("p", "partner-admin-error"); error.setAttribute("role", "status");
      var actions = node("div", "partner-admin-actions");
      actions.appendChild(button(item.status === "new" ? "Oznacz jako przeczytane" : "Oznacz jako nowe", "", function (btn) {
        action(item.id, item.status === "new" ? "read" : "new", btn, error);
      }));
      actions.appendChild(button("Usuń", "", function (btn) { action(item.id, "delete", btn, error); }));
      card.appendChild(actions); card.appendChild(error); list.appendChild(card);
    });
  }
  function load() {
    if (busy) return Promise.resolve();
    busy = true;
    list.textContent = "Wczytuję zapytania…";
    return rpc("admin_partnership_inquiries", {}).then(function (items) {
      if (!Array.isArray(items)) throw new Error("Błędna odpowiedź");
      render(items);
    }).catch(function () { list.textContent = "Nie udało się wczytać zapytań. Sprawdź połączenie i uprawnienia, a potem odśwież."; })
      .finally(function () { busy = false; });
  }
  document.getElementById("partner-admin-refresh").addEventListener("click", load);
  window.RJAdminPartner = {load: load};
})();
