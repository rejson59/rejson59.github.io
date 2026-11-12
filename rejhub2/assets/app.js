/* RejHub 2.0 — drobne, spokojne zachowania panelu roboczego */
(function () {
  "use strict";

  var hour = new Date().getHours();
  var greeting =
    hour < 5 ? "Dobrej nocy" : hour < 12 ? "Dzień dobry" : hour < 18 ? "Dobry dzień" : "Dobry wieczór";

  var greetingNode = document.getElementById("greeting");
  if (greetingNode) greetingNode.textContent = greeting;

  var todayNode = document.getElementById("today");
  if (todayNode) {
    var date = new Date().toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    todayNode.textContent = "RejHub 2.0 · " + date;
  }

  var stampNode = document.getElementById("stamp");
  if (stampNode) {
    stampNode.textContent =
      "ostatnie wejście: " +
      new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  }

  var logout = document.getElementById("logout");
  if (logout) {
    logout.addEventListener("click", function () {
      logout.disabled = true;
      logout.textContent = "Wylogowuję…";
      fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).finally(function () {
        window.location.replace("/login");
      });
    });
  }

  // Delikatny refleks światła podążający za kursorem — tylko na urządzeniach z myszką.
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", (event.clientX - rect.left) / rect.width);
        card.style.setProperty("--my", (event.clientY - rect.top) / rect.height);
      });
    });
  }
})();
