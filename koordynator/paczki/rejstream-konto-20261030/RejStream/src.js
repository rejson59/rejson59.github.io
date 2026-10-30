import { coverArt } from "./cover-art.js";
import { watchPath, adjacentEpisodes, watchGuide } from "./watch-order.js";
import { account } from "./account.js";
import {
  records,
  position,
  formatTime,
  latestProgress,
  trackYouTube,
} from "./progress.js";
import { catalogRuntime, runtimeLabel } from "./runtime.js";
import { trailers, embedURL, seasonTrailer, seasonTrailers } from "./trailers.js";
import { polishKind, polishLabel, audioSource } from "./polish-audio.js";
import {
  createIcons,
  Play,
  House,
  Clapperboard,
  Bookmark,
  Search,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  Languages,
  Captions,
  Film,
  List,
  LayoutGrid,
  CheckCircle2,
  Heart,
  Sparkles,
  Clock,
  ShieldCheck,
  SlidersHorizontal,
  Info,
} from "lucide";
import {
  series,
  getSeries,
  libraryEpisodes,
  episodeKey,
  escapeHTML as esc,
} from "./catalog.js";
import { mountNativePlayer } from "./native-player.js";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-ext-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-ext-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-ext-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-ext-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-ext-800.css";
import "./style.css";
const icons = {
  Play,
  House,
  Clapperboard,
  Bookmark,
  Search,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  Languages,
  Captions,
  Film,
  List,
  LayoutGrid,
  CheckCircle2,
  Heart,
  Sparkles,
  Clock,
  ShieldCheck,
  SlidersHorizontal,
  Info,
};
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const read = (key, fallback) => {
  try {
    return (
      JSON.parse(
        (["rej-favorites", "rej-watched"].includes(key)
          ? account.storage()
          : localStorage
        ).getItem(key),
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    (["rej-favorites", "rej-watched"].includes(key)
      ? account.storage()
      : localStorage
    ).setItem(key, JSON.stringify(value));
  } catch {}
};
let favorites = [],
  watched = [],
  recent = [];
let searchNavigation = false;
let search = "",
  sort = "recommended",
  featured = "circus",
  view = read("rej-view", "list"),
  dispose = null,
  activeShow = null,
  activeEpisode = null;
const seasonState = {},
  filterState = {};
let dialogFocus = null;
const app = document.querySelector("#app");
app.innerHTML = `<a class="skip-link" href="#content">Przejdź do treści</a><aside class="sidebar"><a href="#home" class="brand" aria-label="RejStream — strona główna"><img class="brand-symbol" src="./rejstream-mark.svg" width="36" height="36" alt="">rej<span>stream</span><b>•</b></a><div class="nav-label">TWOJE MIEJSCE NA DOBRE HISTORIE</div><nav aria-label="Menu główne">${navButtons()}</nav><div class="sidebar-bottom"><div class="studio-note">${icon("sparkles")} Poza głównym nurtem.<p>Niezależni twórcy.<br>Nieprzeciętne historie.</p></div><button class="quiet" data-go="local">${icon("film")} Własny odtwarzacz</button><button class="quiet" id="help">${icon("circle-help")} Jak to działa?</button><a class="profile" href="#account"><span class="avatar">R</span><div><span class="profile-heading">Twój kolejny seans</span><small class="profile-message">Zaloguj się i zachowaj swoje postępy.</small></div></a></div></aside><div class="page"><header class="topbar"><a href="#home" class="mobile-brand" aria-label="RejStream — strona główna"><img src="./rejstream-mark.svg" width="30" height="30" alt=""><span>rejstream</span></a><div id="breadcrumbs"></div><label class="search-box">${icon("search")}<input id="search" type="search" placeholder="Znajdź swoją następną obsesję…" aria-label="Szukaj seriali i odcinków"><kbd>/</kbd></label><button class="mobile-search" aria-label="Otwórz wyszukiwanie">${icon("search")}</button><a href="#account" class="avatar header-avatar" aria-label="Konto społeczności">R</a></header><p id="cloud-status" role="status" hidden></p><main id="content" tabindex="-1"></main><footer><a class="brand small" href="#home"><img class="brand-symbol" src="./rejstream-mark.svg" width="28" height="28" alt="">rej<span>stream</span><b>•</b></a><p>Mało przewijania. Dużo dobrych historii.</p><button id="sources">Źródła i twórcy ${icon("arrow-up-right")}</button><span>© ${new Date().getFullYear()} RejStream</span></footer></div><nav class="bottom-nav" aria-label="Menu mobilne">${navButtons(true)}</nav><div class="dialog-backdrop" id="dialog" hidden></div><div id="toast" role="status"></div>`;
let entryNudgeDismissed = false;
const dismissedEpisodeNudges = new Set();
let loginReturn = null;
let accountMode = "login";
function loginNudge(context, key = "entry") {
  if (
    account.state().username ||
    (context === "entry"
      ? entryNudgeDismissed
      : dismissedEpisodeNudges.has(key))
  )
    return "";
  return `<aside class="login-nudge" aria-label="Korzyści z konta społeczności" data-nudge="${esc(key)}"><span class="nudge-icon">${icon("bookmark")}</span><div class="nudge-copy"><strong>${context === "episode" ? "Nie trać miejsca w historii." : "Twój seans zasługuje na ciąg dalszy."}</strong><p>Po zalogowaniu: powrót do zapisanej sekundy, historia na koncie i ulubione pod ręką.</p><small>Jedno konto do RejStream i społeczności.</small></div><a class="button primary nudge-login" href="#account">Zaloguj i zapisuj postęp ${icon("arrow-right")}</a><button class="nudge-close" type="button" aria-label="Zamknij zachętę do logowania">${icon("x")}</button></aside>`;
}
function titleTranslationNote(e) {
  return e.titleTranslation === "editorial"
    ? '<small class="title-translation-note">Polski tytuł: tłumaczenie redakcji RejStream, nie oficjalny tytuł dystrybutora.</small>'
    : "";
}
function requireAccount() {
  if (account.state().username) return true;
  go("account");
  showToast("Zaloguj się kontem społeczności, aby korzystać z tej opcji.");
  return false;
}
function accountPrompt(title) {
  return `<section class="section"><div class="page-heading"><h1>${title}</h1><p>Zaloguj się kontem społeczności Rejson, aby synchronizować historię, pozycje odcinków, ulubione i oznaczenia obejrzanych.</p><p>Bez logowania oglądasz swobodnie — nie zapisujemy Twojej historii ani pozycji.</p><a class="button primary" href="#account">Zaloguj się</a></div></section>`;
}
function accountPage() {
  const { username, error } = account.state();
  return `<section class="section account-section"><div class="page-heading"><span class="eyebrow">JEDNO KONTO · SPOŁECZNOŚĆ REJSON</span><h1>${username ? `Cześć, ${esc(username)}` : accountMode === "register" ? "Utwórz konto" : "Zaloguj się"}<span>.</span></h1><p>To samo konto co na rejson59.github.io/spolecznosc. Historia, wznawianie, ulubione i obejrzane są przypisane do konta. Nie przechowujemy ich lokalnie.</p></div>${username ? `<p>Sesja konta jest wspólna ze społecznością na tej samej domenie.</p><div class="hero-actions"><button id="account-sync" class="button secondary">Ponów synchronizację</button><button id="account-logout" class="button secondary">Wyloguj się</button></div>` : `<div class="hero-actions" role="group" aria-label="Wybierz sposób korzystania z konta"><button type="button" class="button secondary" data-account-mode="login" aria-pressed="${accountMode === "login"}">Zaloguj się</button><button type="button" class="button secondary" data-account-mode="register" aria-pressed="${accountMode === "register"}">Utwórz konto</button></div><form id="account-form" class="account-form"><label>Nazwa użytkownika<input name="username" autocomplete="username" required minlength="3" maxlength="24"></label><label><span id="account-secret-label">${accountMode === "login" ? "Hasło lub dotychczasowy PIN" : "Hasło"}</span><input name="secret" type="password" autocomplete="${accountMode === "login" ? "current-password" : "new-password"}" required></label><label id="account-confirm-label" ${accountMode === "login" ? "hidden" : ""}>Powtórz hasło<input name="confirm" type="password" autocomplete="new-password" ${accountMode === "register" ? "required" : ""}></label><p id="account-auth-hint">${accountMode === "login" ? "Możesz użyć hasła albo swojego dotychczasowego PIN-u." : "Hasło musi mieć co najmniej 10 znaków i maksymalnie 72 bajty. Nie ma automatycznego odzyskiwania zapomnianego hasła."}</p><button class="button primary" type="submit">${accountMode === "login" ? "Zaloguj się" : "Utwórz konto"}</button></form>`}<p id="account-error" role="status">${esc(error)}</p><p>Na urządzeniu pozostaje tylko token logowania i ustawienia interfejsu. Plików wideo nie wysyłamy; dla lokalnego filmu zapisujemy nazwę i pozycję na koncie.</p></section>`;
}
function navButtons(mobile = false) {
  return [
    { key: "home", icon: "house", label: mobile ? "Start" : "Strona główna" },
    { key: "library", icon: "clapperboard", label: "Seriale" },
    ...(!mobile
      ? [{ key: "account", icon: "shield-check", label: "Konto" }]
      : []),
    { key: "saved", icon: "bookmark", label: "Moja lista" },
    {
      key: "history",
      icon: "clock",
      label: mobile ? "Historia" : "Historia oglądania",
    },
    ...(mobile ? [{ key: "local", icon: "film", label: "Mój player" }] : []),
  ]
    .map(
      (n) =>
        `<a href="#${n.key}" data-nav="${n.key}">${icon(n.icon)}<span>${n.label}</span>${!mobile && n.key === "saved" ? '<small id="favorite-count"></small>' : ""}</a>`,
    )
    .join("");
}
const content = document.querySelector("#content");
const thumb = (id, size = "hqdefault") =>
  `https://i.ytimg.com/vi/${id}/${size}.jpg`;
const isSaved = (key) => favorites.includes(key);
const route = () => location.hash.slice(1).split("/").filter(Boolean);
function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}
function showToast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}
function favorite(key) {
  if (!requireAccount()) return;
  favorites = isSaved(key)
    ? favorites.filter((x) => x !== key)
    : [...favorites, key];
  store("rej-favorites", favorites);
  showToast(
    isSaved(key) ? "Dodano do Twojej listy." : "Usunięto z Twojej listy.",
  );
  render();
}
function saveButton(show, small = false) {
  return `<button class="${small ? "save-card" : "button secondary"} ${isSaved(show.key) ? "is-saved" : ""}" data-save="${show.key}" aria-label="${isSaved(show.key) ? "Usuń z listy" : "Dodaj do listy"}: ${show.title}" aria-pressed="${isSaved(show.key)}">${icon(isSaved(show.key) ? "check" : "plus")}${small ? "" : isSaved(show.key) ? "Na mojej liście" : "Moja lista"}</button>`;
}
function seriesCard(show) {
  return `<article class="series-card" style="--accent:${show.color}"><a href="#series/${show.key}" class="series-image series-cover cover-${coverArt[show.key]?.kind || "poster"}" aria-label="Zobacz ${show.title}"><img src="${coverArt[show.key]?.src || thumb(show.art)}" alt="${show.title} — grafika promocyjna" loading="lazy"><span class="image-gradient"></span><span class="cover-title" aria-hidden="true">${esc(show.title)}</span><span class="image-badge">${show.cardBadge || (show.key === "circus" ? "9 ODCINKÓW" : show.key === "helluva" ? "2 PEŁNE SEZONY" : "8 ODCINKÓW")}</span><span class="hover-play">${icon("arrow-right")}</span></a>${saveButton(show, true)}<div class="card-line"><span>${show.creator.split(" · ")[0]}</span><span>${show.age}</span></div><a href="#series/${show.key}"><h3>${show.title}</h3></a><p>${show.genre} <span>•</span> ${show.year}</p></article>`;
}
function hero(show) {
  return `<section class="spotlight" style="--accent:${show.color}"><img class="spotlight-art" src="${coverArt[show.key]?.src || thumb(show.hero, "maxresdefault")}" alt="" fetchpriority="high"><div class="spotlight-shade"></div><div class="spotlight-copy"><div class="eyebrow">${icon("sparkles")} REJSTREAM SELECT <span>•</span> NIEZALEŻNA ANIMACJA</div><span class="feature-label"><span class="live-dot"></span> ${show.key === "circus" ? "Wszystkie 9 odcinków. Jedna niezwykła historia." : show.label}</span><h1>${show.key === "circus" ? "THE AMAZING<br><span>DIGITAL CIRCUS</span>" : show.key === "helluva" ? "HELLUVA<br><span>BOSS</span>" : show.key === "drones" ? "MURDER<br><span>DRONES</span>" : esc(show.title)}</h1><div class="meta"><span class="age">${show.age}</span><span>${show.year}</span><span>${show.genre}</span></div><p>${show.description}</p>${inlineTrailer(show)}<div class="hero-actions"><button class="button primary" data-go="${watchPath(show)}">${icon("play")} Oglądaj od początku</button><a class="button secondary" href="#series/${show.key}">Poznaj serial ${icon("arrow-right")}</a></div><div class="hero-source">${icon("languages")} Języki i napisy w źródłowym odtwarzaczu</div></div><div class="spotlight-switcher" aria-label="Wyróżniony serial">${series
    .slice(0, 3)
    .map(
      (s, i) =>
        `<button data-feature="${s.key}" class="${s.key === show.key ? "selected" : ""}" aria-label="Wyróżnij ${s.title}" aria-pressed="${s.key === show.key}"><span>0${i + 1}</span><b>${s.short}</b><i></i></button>`,
    )
    .join("")}</div></section>`;
}
function historyPage() {
  if (!account.state().username) return accountPrompt("Historia oglądania");
  const seen = new Set();
  const entries = Object.values(records())
    // Removed catalog entries must not reappear as mislabeled local files.
    .filter(
      (r) =>
        !r.episode ||
        r.episode.startsWith("local:") ||
        series.some((show) =>
          show.episodes.some((ep) => episodeKey(show.key, ep) === r.episode),
        ),
    )
    .filter((r) => r.seconds > 0 || r.position > 0 || r.completed)
    .sort((a, b) => b.updated - a.updated)
    .filter((r) => {
      const key = r.episode || r.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return `<section class="section history-section"><div class="page-heading"><span class="eyebrow">OSTATNIO OGLĄDANE</span><h1>Historia oglądania<span>.</span></h1><p>Twoje materiały i zapisane pozycje, od najnowszych. Historia jest zapisywana na Twoim koncie społeczności, nie w pamięci przeglądarki.</p></div>${
    entries.length
      ? `<ul class="history-list">${entries
          .map((r) => {
            const show = series.find((s) =>
              s.episodes.some((e) => episodeKey(s.key, e) === r.episode),
            );
            const ep = show?.episodes.find(
              (e) => episodeKey(show.key, e) === r.episode,
            );
            const href = ep
              ? `watch/${show.key}/${ep.season}/${ep.number}`
              : "local";
            return `<li class="history-item"><div><h2>${esc(ep ? `${show.title} — ${ep.title}` : r.label || "Lokalny materiał")}</h2><small>${esc(new Date(r.updated).toLocaleString("pl-PL"))} · ${r.completed ? "Obejrzane" : "Zapisana pozycja"}</small>${progressMarkup(r)}</div><a class="button secondary" href="#${href}">${icon(ep ? "play" : "film")}${ep ? "Wróć do odcinka" : "Wybierz plik ponownie"}</a></li>`;
          })
          .join("")}</ul>`
      : empty(
          "Jeszcze nic tu nie ma",
          "Historia pojawi się, gdy zaczniesz odtwarzać odcinek lub własny plik.",
          "Przeglądaj seriale",
          "library",
        )
  }</section>`;
}
function progressMarkup(entry) {
  if (!entry)
    return account.state().username
      ? '<span class="progress-empty">Postęp pojawi się po rozpoczęciu odtwarzania.</span>'
      : '<a class="progress-empty" href="#account">Zaloguj się, aby zapisywać postęp na koncie.</a>';
  const duration = Math.max(1, entry.duration),
    value = Math.min(duration, entry.completed ? duration : entry.position);
  return `<span class="position-progress"><progress max="${duration}" value="${value}" aria-label="Zapisana pozycja: ${formatTime(value)} z ${formatTime(duration)}"></progress><span class="position-time">${formatTime(value)}</span></span>`;
}
function runtimeTrivia() {
  const stats = catalogRuntime(series, seasonTrailers);
  if (stats.unknown) return ""; // Never present a partial sum as everything.
  const seriesWord = "tytułów";
  return `<aside class="runtime-trivia" aria-labelledby="runtime-trivia-title"><span class="eyebrow">MAŁY KATALOG, DŁUGI MARATON</span><h3 id="runtime-trivia-title">Tylko ${stats.seriesCount} ${seriesWord}? Wyzwanie przyjęte 😜</h3><p>Wiemy, że aktualnie mamy tylko ${stats.seriesCount} ${seriesWord}, ale założymy się, że tak szybko ich nie obejrzysz! Wszystko, co dodaliśmy do katalogu, zajmie Ci łącznie <strong>około ${runtimeLabel(stats.total)}</strong>.</p><details><summary>Skąd ta liczba?</summary><ul>${stats.breakdown.map((row) => `<li>${esc(row.title)}: około ${runtimeLabel(row.seconds)}</li>`).join("")}<li>Zwiastuny: ${runtimeLabel(stats.trailerSeconds)}</li></ul><p>Wliczamy odcinki, shorts, piloty (także Lackadaisy i Gameoverse), krótkie animacje, montaż sezonu 1 Meta Runner i zwiastuny — każdy materiał raz, bez powtórek dubbingów. W tym około ${runtimeLabel(stats.external)} to odcinki dostępne tylko zewnętrznie w Prime Video. W RejStream: około ${runtimeLabel(stats.embedded + stats.trailerSeconds)} materiałów z YouTube. Część czasów jest zaokrąglona; bez reklam, przerw i własnych plików.</p></details></aside>`;
}
function home() {
  const last = recent
    .map((r) => ({ r, s: getSeries(r.show) }))
    .find(({ r, s }) =>
      s?.episodes.some((e) => episodeKey(s.key, e) === r.key),
    );
  return `${hero(getSeries(featured))}<section class="section"><div class="section-heading"><div><span class="eyebrow">WYBIERZ SWÓJ ŚWIAT</span><h2>Nieprzeciętne historie<span>.</span></h2><p>Więcej światów. Jeden dobry wieczór.</p></div><a class="text-link" href="#library">Wszystkie tytuły ${icon("arrow-right")}</a></div><div class="series-grid">${series.map(seriesCard).join("")}</div>${runtimeTrivia()}${last ? recentCard(last) : ""}<div class="editorial"><span class="editorial-icon">${icon("heart")}</span><div><span class="eyebrow">OD TWÓRCÓW. DLA CIEBIE.</span><h3>Duże historie nie potrzebują wielkiego studia.</h3><p>Odkrywaj niezależną animację. Oglądaj z oficjalnych źródeł i wspieraj ludzi, którzy ją tworzą.</p></div><button class="text-link" data-info="sources">Poznaj twórców ${icon("arrow-up-right")}</button></div></section>`;
}
function recentCard({ r, s }) {
  const e = s.episodes.find((e) => episodeKey(s.key, e) === r.key);
  return `<section class="recent-section"><div class="section-heading compact"><h2>Wróć do swojej historii</h2><span>Ostatnio otwarty odcinek</span></div><a class="recent-card" href="#watch/${s.key}/${e.season}/${e.number}"><img src="${thumb(e.id || s.art)}" alt=""><span class="recent-copy"><small>${s.title} · ${episodeLabel(e)}</small><b>${esc(e.title)}</b><span>Wróć do odcinka ${icon("arrow-right")}</span></span><span class="recent-play">${icon("play")}</span></a></section>`;
}
function library(saved = false) {
  if (saved && !account.state().username) return accountPrompt("Moja lista");
  let shows = series.filter(
    (s) =>
      (!saved || isSaved(s.key)) &&
      `${s.title} ${s.subtitle} ${s.genre}`
        .toLocaleLowerCase("pl")
        .includes(search.toLocaleLowerCase("pl")),
  );
  if (sort === "az") shows.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "za") shows.sort((a, b) => b.title.localeCompare(a.title));
  return `<section class="section library-section"><div class="page-heading"><span class="eyebrow">${saved ? "TWÓJ WYBÓR, TWOJE TEMPO" : "MNIEJ SZUKANIA. WIĘCEJ OGLĄDANIA."}</span><h1>${saved ? "Moja lista" : "Odkrywaj tytuły"}<span>.</span></h1><p>${saved ? "Historie, do których chcesz wrócić. Zapisane na Twoim koncie." : "Seriale, filmy krótkie i kompilacje z oficjalnych źródeł."}</p></div><div class="library-toolbar"><span>${shows.length} ${shows.length === 1 ? "tytuł" : "tytułów"} w kolekcji</span><label>Sortuj <select id="catalog-sort"><option value="recommended" ${sort === "recommended" ? "selected" : ""}>Polecane</option><option value="az" ${sort === "az" ? "selected" : ""}>Tytuł A–Z</option><option value="za" ${sort === "za" ? "selected" : ""}>Tytuł Z–A</option></select></label></div>${shows.length ? `<div class="series-grid">${shows.map(seriesCard).join("")}</div>` : empty(saved ? "Twoja lista czeka na pierwszą historię." : "Nie znaleźliśmy takiego serialu.", saved ? "Dodaj serial przyciskiem + na jego karcie." : "Zmień wyszukiwaną frazę.", "Odkrywaj tytuły", "library")}</section>`;
}
function episodeLabel(e) {
  if (e.collectionLabel) return e.collectionLabel;
  return typeof e.season === "number"
    ? `S${e.season} · E${String(e.number).padStart(2, "0")}`
    : `${e.season === "special" ? "Piloty" : "Shorts"} · ${e.number}`;
}
function inlineTrailer(show, season) {
  const trailer = seasonTrailer(show.key, season);
  if (!trailer) return "";
  return `<figure class="inline-trailer" aria-label="Polski zwiastun: ${esc(show.title)}"><div class="inline-trailer-heading"><span>${icon("film")} ${esc(show.short || show.title)} · ZWIASTUN PL</span><small>${trailer.duration}</small></div><div class="inline-trailer-frame"><iframe src="${embedURL(trailer.id)}" title="${esc(show.title + " — " + trailer.title)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><figcaption><span>${esc(trailer.title)} · <a href="${trailer.channel}" target="_blank" rel="noopener">${esc(trailer.creator)}</a></span><a href="https://www.youtube.com/watch?v=${trailer.id}" target="_blank" rel="noopener" aria-label="Otwórz zwiastun ${esc(show.title)} w YouTube">YouTube ↗</a></figcaption></figure>`;
}
function watchOrderMarkup(show) {
  const guide = watchGuide(show);
  return `<aside class="watch-order" aria-label="Proponowana kolejność oglądania"><span class="eyebrow">OD CZEGO ZACZĄĆ?</span><h2>Proponowana kolejność oglądania</h2><p>${esc(guide.note)}</p><ul>${guide.steps.map(([season, number, label]) => {
    const ep = show.episodes.find((e) => e.season === season && e.number === number);
    return ep ? `<li><a href="#${watchPath(show, ep)}">${esc(label)} ${icon("arrow-right")}</a></li>` : "";
  }).join("")}</ul></aside>`;
}
function seriesPage(show) {
  const selected = seasonState[show.key] || "1";
  const filter = filterState[show.key] || { sort: "asc", language: "all" };
  const list = libraryEpisodes(show, {
    season: selected,
    query: search,
    ...filter,
    watched,
  });
  const season =
    show.seasons.find((s) => s.key === selected) || show.seasons[0];
  return `<section class="series-hero" style="--accent:${show.color}"><img src="${coverArt[show.key]?.src || thumb(show.hero, "maxresdefault")}" alt="" class="series-hero-art"><div class="series-hero-shade"></div><div class="series-hero-copy"><a href="#library" class="back-link">${icon("arrow-left")} Wszystkie tytuły</a><span class="eyebrow">${show.creator}</span><h1>${show.title}</h1><p class="series-subtitle">${show.subtitle}</p><div class="meta"><span class="age">${show.age}</span><span>${show.year}</span><span>${show.genre}</span></div><p class="series-description">${show.description}</p>${show.availabilityNote ? `<p class="availability-note" role="note">${esc(show.availabilityNote)}</p>` : ""}${inlineTrailer(show, selected)}<div class="hero-actions"><button class="button primary" data-go="${watchPath(show)}">${icon("play")} Zacznij oglądać</button>${saveButton(show)}</div></div></section><section class="section episodes-section"><div class="detail-tabs"><span class="active">Odcinki</span><button data-info="languages" data-show="${show.key}">${icon("languages")} Audio i napisy</button><a href="${show.channel}" target="_blank" rel="noopener">Kanał twórców ${icon("arrow-up-right")}</a></div>${watchOrderMarkup(show)}<div class="season-tabs" role="group" aria-label="Wybierz sezon">${show.seasons.map((s) => `<button data-season="${s.key}" class="${s.key === selected ? "selected" : ""}" aria-pressed="${s.key === selected}">${s.label}</button>`).join("")}</div><div class="episode-toolbar"><div><h2>${season.label}</h2><p>${season.note}</p></div><div class="episode-options"><label><span class="sr-only">Filtr audio</span><select id="audio-filter"><option value="all">Wszystkie wersje</option><option value="polish" ${filter.language === "polish" ? "selected" : ""}>Polskie audio (wszystkie)</option><option value="fandub" ${filter.language === "fandub" ? "selected" : ""}>Polski fandub</option></select></label><label><span class="sr-only">Kolejność odcinków</span><select id="episode-sort"><option value="asc">Od pierwszego</option><option value="desc" ${filter.sort === "desc" ? "selected" : ""}>Od ostatniego</option></select></label><div class="view-switch" role="group" aria-label="Układ odcinków"><button data-view="list" class="${view === "list" ? "selected" : ""}" aria-label="Lista" aria-pressed="${view === "list"}">${icon("list")}</button><button data-view="grid" class="${view === "grid" ? "selected" : ""}" aria-label="Siatka" aria-pressed="${view === "grid"}">${icon("layout-grid")}</button></div></div></div><div class="language-strip">${icon("languages")} <span>${["metal-family", "meta-runner", "lackadaisy", "gameoverse"].includes(show.key) ? esc(show.languageNote) : show.collection ? "Polskie audio jest w tym uploadzie od razu. Napisy i odtwarzanie zależą od źródła i regionu." : show.key === "helluva" ? "Znalezione polskie wersje są oznaczone przy odcinkach. Fandub, lektor i brak potwierdzenia to osobne statusy." : "Oficjalny polski dubbing jest w ustawieniach odtwarzacza: ⚙ → Ścieżka dźwiękowa → Polski."}</span><button data-info="languages" data-show="${show.key}">Jak włączyć? ${icon("arrow-right")}</button></div><div class="episodes ${view}" id="episodes">${list.length ? list.map((e) => episodeCard(show, e)).join("") : empty("Tu jeszcze cicho.", "Brak odcinków dla tej frazy lub filtra.", "Wyczyść filtry", `reset/${show.key}`)}</div><p class="catalog-note">${show.episodes.some((e) => e.titleTranslation === "editorial") ? "Polskie tytuły to tłumaczenia redakcji RejStream; obok zachowujemy oryginały. " : ""}${icon("info")} ${show.catalogNote ? esc(show.catalogNote) : show.key === "circus" ? "Sezon 1 · 9 odcinków. Pilot jest odcinkiem 1, nie osobnym sezonem." : show.key === "helluva" ? "Sezony 1–2 i shorts 1–14 kompletne. Sezon 3 w trakcie emisji — odcinki dostępne zewnętrznie." : "Kompletny serial: 8 odcinków z oficjalnego kanału GLITCH."} Czas odcinków podany w przybliżeniu.</p></section>`;
}
function episodeCard(show, e) {
  const key = episodeKey(show.key, e),
    done = watched.includes(key);
  const progress = latestProgress(key);
  return `<article class="episode ${done ? "watched" : ""}" data-episode="${key}"><a class="episode-image" href="#watch/${show.key}/${e.season}/${e.number}" aria-label="${e.id ? "Oglądaj" : "Sprawdź źródło"}: ${esc(e.title)}"><img src="${thumb(e.id || show.art)}" alt="" loading="lazy"><span class="episode-number">${String(e.number).padStart(2, "0")}</span><span class="episode-duration">${e.time}</span><span class="episode-play">${icon(e.id ? "play" : "arrow-up-right")}</span></a><div class="episode-copy"><div class="episode-overline">${episodeLabel(e)} ${e.id ? `<span class="pl-label ${polishKind(e) === "missing" ? "pl-missing" : ""}">${polishLabel(e)}</span>` : ""}${!e.id ? '<span class="external-label">PRIME VIDEO · ZEWNĘTRZNIE</span>' : ""}</div><a href="#watch/${show.key}/${e.season}/${e.number}"><h3>${esc(e.title)}</h3></a><p>${esc(e.desc)}</p><span class="episode-foot">${progress ? progressMarkup(progress) : done ? `${icon("check-circle-2")} Obejrzane` : e.date ? new Date(e.date + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : e.id ? "Oficjalne źródło YouTube" : "Sprawdź dostępność u dystrybutora"}</span></div><button class="watched-button ${done ? "done" : ""}" data-watched="${key}" aria-label="${done ? "Cofnij oznaczenie" : "Oznacz jako obejrzane"}: ${esc(e.title)}" aria-pressed="${done}">${icon(done ? "check-circle-2" : "check")}</button></article>`;
}
function record(show, e) {
  if (!e.id || !account.state().username) return;
  const key = episodeKey(show.key, e);
  recent = [
    { show: show.key, key },
    ...recent.filter((r) => r.key !== key),
  ].slice(0, 8);
}
function polishNotice(show, e) {
  const kind = polishKind(e);
  const message = e.polishInline
    ? "Oficjalny upload z polskim audio od razu — bez wybierania ścieżki dźwiękowej. Napisy są osobną opcją i zależą od źródła."
    : {
        official:
          "Oficjalny polski dubbing · ⚙ → Ścieżka dźwiękowa → Polski. Wybór wykonaj w odtwarzaczu YouTube; RejStream nie przełącza tej ścieżki automatycznie.",
        fandub:
          "Pełny polski fandub dostępny w wyborze wersji materiału. To osobne, nieoficjalne nagranie z podpisanymi autorami.",
        lektor:
          "Znaleziono pełny odcinek z polskim lektorem amatorskim, nie dubbingiem. Nie znaleziono pełnej, dostępnej wersji z dubbingiem.",
        missing:
          "Nie znaleziono pełnego, dostępnego polskiego dubbingu do tego odcinka. Nie zastępujemy go zwiastunem, fragmentem ani samymi napisami.",
      }[kind];
  const prime =
    show.key === "helluva" &&
    (e.season === 1 ||
      e.season === 2 ||
      (e.season === "special" && e.number === 2));
  return `<div class="polish-notice ${kind}" role="note"><b>${polishLabel(e)}</b><p>${message}</p>${prime ? `<p>Alternatywa: oficjalny polski <b>lektor</b> w Prime Video (wymaga abonamentu; dostępność zależy od regionu). <a href="https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Helluva%20Boss" target="_blank" rel="noopener">Sprawdź w Prime Video ↗</a></p>` : ""}</div>`;
}
function trailerPage(show) {
  const trailer = trailers[show.key];
  activeShow = { ...show, creator: trailer.creator };
  activeEpisode = { id: trailer.id, title: trailer.title, isTrailer: true };
  return `<section class="watch-section trailer-section"><a class="back-link" href="#series/${show.key}">${icon("arrow-left")} Wróć do ${show.title}</a><div class="trailer-heading"><span class="eyebrow">ZWIASTUN · POLSKI DUBBING · ${trailer.duration}</span><h1>${show.title}</h1><p>${trailer.title}</p></div><div class="player-frame" id="video-wrap"></div><div class="player-health"><span id="player-health-text" role="status">Łączenie z YouTube…</span><button id="player-retry" class="button secondary" hidden>Wczytaj ponownie</button></div><div class="polish-notice"><b>POLSKI DUBBING OD RAZU</b><p>Otwieramy polskojęzyczny zwiastun, bez wybierania ścieżki audio. ${trailer.kind === "fandub" ? "To nieoficjalny fandub, nie zwiastun z oficjalnym polskim dubbingiem." : "Materiał od twórców oficjalnego polskiego dubbingu."} Napisy PL są domyślnie włączane, jeśli źródło je udostępnia.</p></div><div class="playback-options"><label>Preferowane napisy<select id="subs"><option value="pl" selected>Polskie — domyślnie, jeśli dostępne</option><option value="">Ustawienia źródła</option><option value="en">English — jeśli dostępne</option></select></label></div><p id="caption-status" class="caption-status" role="note">Preferowane napisy: polskie. Sprawdzanie możliwości odtwarzacza…</p><div id="audio-credit" class="audio-credit" aria-live="polite"></div><p class="trailer-credit">Polska wersja: <a href="${trailer.channel}" target="_blank" rel="noopener">${trailer.creator}</a>. Pełna obsada w opisie materiału.</p><div class="source-row"><span id="playback-source"></span><a id="youtube-link" target="_blank" rel="noopener">Otwórz zwiastun w YouTube ↗</a></div><div class="episode-navigation"><a class="button secondary" href="#series/${show.key}">Lista odcinków</a><a class="button primary" href="#${watchPath(show)}">${icon("play")} Oglądaj serial</a></div></section>`;
}
function watchPage(show, e) {
  activeShow = show;
  activeEpisode = e;
  record(show, e);
  const list = show.episodes
    .filter((x) => String(x.season) === String(e.season))
    .sort((a, b) => a.number - b.number);
  const { previous, next } = adjacentEpisodes(show, e);
  return `<section class="watch-section"><a class="back-link" href="#series/${show.key}">${icon("arrow-left")} ${show.title} <span>/ ${episodeLabel(e)}</span></a><div class="watch-layout"><div class="watch-main">${loginNudge("episode", episodeKey(show.key, e))}${show.availabilityNote ? `<p class="availability-note" role="note">${esc(show.availabilityNote)}</p>` : ""}<div class="player-frame" id="video-wrap">${e.id ? "" : `<div class="external-player"><span>${icon("arrow-up-right")}</span><h2>Ten odcinek jest w innym serwisie</h2><p>Sprawdź dostępność, wymagany abonament oraz języki w Prime Video.</p><a href="${e.external}" target="_blank" rel="noopener" class="button primary">Przejdź do Prime Video ${icon("arrow-up-right")}</a></div>`}</div><div class="player-health"><span id="player-health-text" role="status">Łączenie z YouTube…</span><button id="player-retry" class="button secondary" hidden>Wczytaj ponownie</button></div><div class="watch-title-row"><div><span class="eyebrow">${episodeLabel(e)} · ${e.time}</span><h1>${esc(e.title)}</h1></div><button class="button secondary" data-watched="${episodeKey(show.key, e)}" aria-pressed="${watched.includes(episodeKey(show.key, e))}">${icon(watched.includes(episodeKey(show.key, e)) ? "check-circle-2" : "check")} ${watched.includes(episodeKey(show.key, e)) ? "Obejrzane" : "Oznacz jako obejrzane"}</button></div><p class="watch-description">${esc(e.desc)}</p>${titleTranslationNote(e)}${show.key === "helluva" && e.season === "special" ? watchOrderMarkup(show) : ""}${e.id ? `<p id="watch-progress" class="watch-progress" role="note">${progressMarkup(latestProgress(episodeKey(show.key, e)))}</p>` : ""}${e.id ? `<div class="playback-options"><label>Wersja materiału<select id="audio"><option value="original">Oryginalny materiał · audio w ustawieniach</option>${(e.polishAudio || []).map((a, i) => `<option value="${i === 0 ? "pl" : "pl:" + a.video}" ${i === 0 && read("rej-prefer-polish-v2", true) === true ? "selected" : ""}>Polski · ${a.kind === "lektor" ? "lektor (nie dubbing)" : "nieoficjalny fandub"} · ${esc(a.creator)}${a.externalOnly ? " · w YouTube" : ""}</option>`).join("")}</select></label><label>Preferowane napisy<select id="subs"><option value="">Ustawienia źródła</option><option value="pl" selected>Polskie — domyślnie, jeśli dostępne</option><option value="en">English — jeśli dostępne</option></select></label></div>${polishNotice(show, e)}<p id="caption-status" class="caption-status" role="note">Preferowane napisy: polskie. Sprawdzanie możliwości odtwarzacza…</p><div id="audio-credit" class="audio-credit" aria-live="polite"></div><details class="language-details"><summary>${icon("languages")} Audio, dubbing i napisy ${icon("chevron-down")}</summary><p>${show.languageNote}</p><p>Wybierz koło zębate w odtwarzaczu → Ścieżka dźwiękowa lub Napisy. Preferencja napisów nie gwarantuje, że źródło je udostępnia. Polski fandub, jeśli jest wymieniony wyżej, otwiera osobny materiał.</p></details><div class="source-row"><span id="playback-source">${icon("shield-check")} Źródło: ${show.creator.split(" · ")[0]} / YouTube</span><a id="youtube-link" target="_blank" rel="noopener">Otwórz w YouTube ${icon("arrow-up-right")}</a></div>` : ""}<div class="episode-navigation">${previous ? `<a class="button secondary" href="#${watchPath(show, previous)}">${icon("arrow-left")} Poprzedni</a>` : "<span></span>"}${next ? `<a class="button primary" href="#${watchPath(show, next)}">${next.season !== e.season ? next.id ? "Dalej: " + esc(episodeLabel(next)) : "Dalej: Prime Video (zewnętrznie)" : "Następny odcinek"} ${icon("arrow-right")}</a>` : `<a class="button secondary" href="#series/${show.key}">Wróć do serialu ${icon("arrow-right")}</a>`}</div></div><aside class="watch-queue"><div class="queue-heading"><h2>${esc(show.seasons.find((s) => s.key === String(e.season))?.label || "Odcinki")}</h2><span>${list.length} wpisów</span></div><div class="queue-list">${list.map((x) => `<a href="#watch/${show.key}/${x.season}/${x.number}" class="queue-item ${x === e ? "current" : ""}" ${x === e ? 'aria-current="true"' : ""}><span class="queue-number">${String(x.number).padStart(2, "0")}</span><img src="${thumb(x.id || show.art)}" alt="" loading="lazy"><span><b>${esc(x.title)}</b><small>${x === e ? "Teraz otwarte" : watched.includes(episodeKey(show.key, x)) ? "Obejrzane" : x.time}</small></span>${x === e ? icon("play") : ""}</a>`).join("")}</div></aside></div></section>`;
}
function loadEmbed(force = false) {
  if (!activeEpisode?.id) return;
  const e = activeEpisode;
  const lang = document.querySelector("#audio")?.value;
  const sub = document.querySelector("#subs")?.value;
  const chosen = audioSource(e, lang);
  const id = chosen?.video || e.id;
  if (
    !force &&
    dispose &&
    document.querySelector("#episode-player")?.dataset.videoId === id
  ) {
    dispose.setSubtitles?.(sub ?? "pl");
    return;
  }
  dispose?.();
  dispose = null;
  const trackingKey = `youtube:${episodeKey(activeShow.key, e)}:${id}`;
  const saved = e.isTrailer ? 0 : position(trackingKey);
  const url = new URL(embedURL(id, sub ?? "pl"));
  if (!e.isTrailer) {
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", location.origin);
    if (saved > 0) url.searchParams.set("start", String(Math.floor(saved)));
  }
  document.querySelector("#video-wrap").innerHTML = chosen?.externalOnly
    ? `<div class="external-player"><h2>Polski fandub w YouTube</h2><p>Materiał ma ograniczenie wieku i wymaga zalogowania w YouTube. Nie można odtworzyć go tutaj.</p><a class="button primary" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Otwórz polską wersję w YouTube</a></div>`
    : `<iframe id="episode-player" data-video-id="${id}" src="${url}" title="${esc(activeShow.title + " — " + e.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  if (!chosen?.externalOnly) {
    const frame = document.querySelector("#episode-player");
    const status = document.querySelector("#watch-progress");
    if (status) status.innerHTML = progressMarkup(records()[trackingKey]);
    dispose = trackYouTube(
      frame,
      e.isTrailer ? null : trackingKey,
      {
        episode: episodeKey(activeShow.key, e),
        label: activeShow.title + " — " + e.title,
      },
      {
        subtitles: sub ?? "pl",
        onCaptions(text) {
          const el = document.querySelector("#caption-status");
          if (el) el.textContent = text;
        },
        onStatus(state) {
          const el = document.querySelector("#player-health-text"),
            retry = document.querySelector("#player-retry");
          if (!el) return;
          el.textContent = {
            loading: "Łączenie z odtwarzaczem YouTube…",
            ready: "Odtwarzacz gotowy. Naciśnij ▶, aby rozpocząć.",
            playing: "Odtwarzanie",
            buffering: "Buforowanie obrazu…",
            slow: "YouTube ładuje się dłużej niż zwykle. Możesz spróbować ponownie lub otworzyć źródło poniżej.",
            error:
              "Nie udało się połączyć z odtwarzaczem YouTube. Spróbuj ponownie lub użyj linku do źródła.",
          }[state];
          if (retry) retry.hidden = !["slow", "error"].includes(state);
        },
        onChange(entry) {
          if (status?.isConnected) status.innerHTML = progressMarkup(entry);
        },
        onUnavailable() {
          const captions = document.querySelector("#caption-status");
          if (captions)
            captions.textContent =
              "Nie można ustawić napisów przez API. Sprawdź ⚙ → Napisy → Polski w YouTube.";
          if (status?.isConnected && !records()[trackingKey])
            status.textContent =
              "API YouTube jest niedostępne — pomiar i dokładne wznawianie nie działają. Zapisany punkt startowy jest zachowany.";
        },
      },
    );
  }
  if (chosen?.externalOnly) {
    document.querySelector("#player-health-text").textContent =
      "Materiał dostępny przez zewnętrzny link do YouTube.";
    document.querySelector("#player-retry").hidden = true;
    document.querySelector("#caption-status").textContent =
      "Język i napisy wybierz po otwarciu materiału w YouTube.";
  }
  if (chosen?.externalOnly)
    document.querySelector("#watch-progress").textContent =
      "Ten materiał otwiera się poza RejStream — nie możemy zapisać jego postępu w YouTube.";
  document.querySelector("#youtube-link").href =
    `https://www.youtube.com/watch?v=${id}`;
  document.querySelector("#playback-source").textContent = chosen
    ? `Źródło: ${chosen.creator} · polski ${chosen.kind === "lektor" ? "lektor (nie dubbing)" : "fandub (nieoficjalny)"} / YouTube`
    : `Źródło: ${activeShow.creator.split(" · ")[0]} / YouTube`;
  document.querySelector("#audio-credit").innerHTML = chosen
    ? `<span>${chosen.kind === "lektor" ? "Lektor amatorski — nie dubbing aktorski." : "Nieoficjalny fandub."} Autorzy: <a href="${chosen.channel}" target="_blank" rel="noopener">${esc(chosen.creator)}</a>. <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Materiał źródłowy i obsada ↗</a></span><small>Wybór polskiego materiału zapamiętujemy na tym urządzeniu. Jeśli osadzenie jest zablokowane, użyj linku do YouTube lub wróć do oryginału. Dostępność może się zmienić.</small>`
    : `<span>${e.isTrailer ? "Ten zwiastun jest osobnym materiałem z polskim dubbingiem. Napisy PL są zamawiane, jeżeli autor je udostępnił." : e.polishInline ? "Polskie audio jest w tym uploadzie od razu." : e.polishTrack ? "Polski dubbing wybierz ręcznie w ustawieniach źródłowego odtwarzacza (⚙)." : "Oryginalny materiał. Dostępne języki sprawdzisz w ustawieniach źródła."}</span>`;
}
function localPage() {
  return `<section class="section local-section"><div class="page-heading"><span class="eyebrow">TYLKO TY I TWOJA HISTORIA</span><h1>Twój prywatny seans<span>.</span></h1><p>Otwórz legalnie posiadany plik z urządzenia. Niczego nie wysyłamy na serwer.</p></div><div id="native-mount"></div><div class="local-tips"><span>${icon("film")} Pliki obsługiwane przez przeglądarkę</span><span>${icon("captions")} Własne napisy SRT i VTT</span><span>${icon("shield-check")} Pliki pozostają na urządzeniu</span></div></section>`;
}
function empty(title, description, action, path) {
  return `<div class="empty-state">${icon("search")}<h3>${title}</h3><p>${description}</p><button class="button secondary" data-go="${path}">${action} ${icon("arrow-right")}</button></div>`;
}
function connectInlineTrailer(frame) {
  let stop, observer;
  const connect = () => {
    if (!stop && frame.isConnected)
      stop = trackYouTube(frame, null, {}, { subtitles: "pl" });
  };
  if (typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          connect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(frame);
  } else connect();
  return () => {
    observer?.disconnect();
    stop?.();
  };
}
let inlineDisposers = [];
function render() {
  inlineDisposers.forEach((stop) => stop());
  inlineDisposers = [];
  const focusedId = content.contains(document.activeElement)
    ? document.activeElement.id
    : null;
  dispose?.();
  dispose = null;
  activeShow = null;
  activeEpisode = null;
  const parts = route(),
    page = parts[0] || "home",
    show = getSeries(parts[1]);
  let html;
  if (page === "trailer" && show) {
    html = trailerPage(show);
  } else if (page === "series" && show) {
    seasonState[show.key] ??= "1";
    html = seriesPage(show);
  } else if (page === "watch" && show) {
    const ep = show.episodes.find(
      (e) => String(e.season) === parts[2] && String(e.number) === parts[3],
    );
    if (ep) {
      seasonState[show.key] = String(ep.season);
      html = watchPage(show, ep);
    } else
      html = `<section class="section">${empty("Nie znaleźliśmy tego odcinka.", "Wróć do listy i wybierz inny.", "Zobacz odcinki", "series/" + show.key)}</section>`;
  } else if (page === "library" || page === "saved")
    html = library(page === "saved");
  else if (page === "account") html = accountPage();
  else if (page === "history") html = historyPage();
  else if (page === "local") html = localPage();
  else if (page === "home") html = home();
  else
    html = `<section class="section">${empty("Ta strona nie istnieje.", "Wróć do odkrywania historii.", "Strona główna", "home")}</section>`;
  if (!["watch", "account"].includes(page)) html = loginNudge("entry") + html;
  content.innerHTML = html;
  content.querySelectorAll(".nudge-close").forEach((button) =>
    button.addEventListener("click", () => {
      const banner = button.closest(".login-nudge");
      if (banner.dataset.nudge === "entry") entryNudgeDismissed = true;
      else dismissedEpisodeNudges.add(banner.dataset.nudge);
      banner.remove();
    }),
  );
  content.querySelectorAll(".nudge-login").forEach((link) =>
    link.addEventListener("click", () => {
      loginReturn = location.hash.slice(1) || "home";
    }),
  );
  document.title = `${show ? show.title : page === "account" ? "Konto społeczności" : page === "history" ? "Historia oglądania" : page === "saved" ? "Moja lista" : page === "local" ? "Twój player" : "Odkrywaj historie"} · RejStream`;
  const crumb = document.querySelector("#breadcrumbs");
  crumb.innerHTML = `<a href="#home">Odkrywaj</a><span>/</span><b>${show ? show.title : page === "library" ? "Seriale" : page === "account" ? "Konto społeczności" : page === "history" ? "Historia oglądania" : page === "saved" ? "Moja lista" : page === "local" ? "Własny player" : "Strona główna"}</b>`;
  document.querySelectorAll("[data-nav]").forEach((n) => {
    const active =
      n.dataset.nav ===
      (["series", "watch", "trailer"].includes(page) ? "library" : page);
    n.classList.toggle("active", active);
    if (active) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  document.querySelector("#favorite-count").textContent = favorites.filter(
    (key) => getSeries(key),
  ).length;
  updateAccountAppearance();
  createIcons({ icons });
  bindContent();
  inlineDisposers = [...content.querySelectorAll(".inline-trailer iframe")].map(
    connectInlineTrailer,
  );
  if (activeEpisode?.id) loadEmbed();
  else document.querySelector(".player-health")?.remove();
  content.querySelectorAll("[data-account-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      accountMode = button.dataset.accountMode;
      render();
      content.querySelector('[name="username"]')?.focus();
    });
  });
  document
    .querySelector("#account-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
      const username = form.elements.username.value.trim(), secret = form.elements.secret.value;
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username)) {
        showToast("Nazwa: 3–24 znaki, litery, cyfry, _ . lub -.");
        return;
      }
      if (new TextEncoder().encode(secret).length > 72 || !secret ||
          (accountMode === "register" && Array.from(secret).length < 10)) {
        showToast("Hasło: co najmniej 10 znaków przy rejestracji i maksymalnie 72 bajty.");
        return;
      }
      if (accountMode === "register" && secret !== form.elements.confirm.value) {
        showToast("Hasła nie są takie same.");
        return;
      }
      const mode = accountMode;
      form.elements.secret.value = "";
      form.elements.confirm.value = "";
      button.disabled = true;
      const modeButtons = [...content.querySelectorAll("[data-account-mode]")];
      modeButtons.forEach((item) => { item.disabled = true; });
      try {
        await (mode === "register" ? account.register(username, secret) : account.login(username, secret));
        const destination = loginReturn || "account";
        loginReturn = null;
        go(destination);
      } catch (error) {
        showToast(error.message);
      } finally {
        button.disabled = false;
        modeButtons.forEach((item) => { item.disabled = false; });
      }
    });
  document
    .querySelector("#account-logout")
    ?.addEventListener("click", () => account.logout());
  document
    .querySelector("#account-sync")
    ?.addEventListener("click", () => account.flush());
  if (page === "local")
    dispose = mountNativePlayer(document.querySelector("#native-mount"), {
      title: "Lokalny plik",
      local: true,
    });
  if (focusedId) document.getElementById(focusedId)?.focus();
}
function bindContent() {
  content.querySelector("#catalog-sort")?.addEventListener("change", (e) => {
    sort = e.target.value;
    render();
  });
  const key = route()[1];
  content.querySelector("#episode-sort")?.addEventListener("change", (e) => {
    filterState[key] = { ...filterState[key], sort: e.target.value };
    render();
  });
  content.querySelector("#audio-filter")?.addEventListener("change", (e) => {
    filterState[key] = { ...filterState[key], language: e.target.value };
    render();
  });
  content.querySelector("#audio")?.addEventListener("change", (event) => {
    store("rej-prefer-polish-v2", event.target.value !== "original");
    loadEmbed();
  });
  content.querySelector("#subs")?.addEventListener("change", (event) => {
    dispose?.setSubtitles?.(event.target.value);
  });
  content
    .querySelector("#player-retry")
    ?.addEventListener("click", () => loadEmbed(true));
}
function showDialog(type, key) {
  const show = getSeries(key);
  dialogFocus = document.activeElement;
  const body =
    type === "languages"
      ? `<span class="eyebrow">AUDIO I NAPISY</span><h2>Oglądaj po swojemu.</h2><p>${show?.languageNote || ""}</p><ol><li>Otwórz wybrany odcinek.</li><li>W odtwarzaczu wybierz koło zębate.</li><li>Wybierz <b>Ścieżkę dźwiękową</b> lub <b>Napisy</b>.</li></ol><p>Nie wyświetlamy fikcyjnej listy wersji językowych. Ostateczna lista jest dostępna w samym źródle; osadzenie nie udostępnia nam pełnej listy ścieżek.</p>`
      : type === "sources"
        ? `<span class="eyebrow">STWORZONE PRZEZ LUDZI Z PASJĄ</span><h2>Historie należą do twórców.</h2><p>RejStream jest niezależnym katalogiem. Oficjalne materiały odtwarzamy z YouTube, bez ukrywania oznaczeń i reklam. Dostępność zależy od autora i regionu.</p><div class="creator-list">${series.map((s) => `<a href="${s.channel}" target="_blank" rel="noopener"><span><b>${s.title}</b><small>${s.creator}</small></span>${icon("arrow-up-right")}</a>`).join("")}</div><p>Grafiki promocyjne GLITCH: <a href="https://www.glitchprod.com/our-shows" target="_blank" rel="noopener">oficjalny katalog twórców ↗</a>. Pozostałe okładki: plakat Helluva Boss i oficjalna zapowiedź Metal Family. Grafiki należą do ich autorów.</p><p>Polskie fanduby są nieoficjalne. Własny player służy Twoim lokalnym plikom; nie wysyła ich do sieci. Biblioteka jest aktualizowana ręcznie, ostatni przegląd: 25.10.2026.</p>`
        : `<span class="eyebrow">TWOJE HISTORIE, ZAPISANE NA KONCIE</span><h2>Wybierz świat. Włącz historię.</h2><p>Otwórz stronę serialu, wybierz sezon i odcinek. Kolejność zmienisz nad listą. Ikoną ✓ możesz ręcznie oznaczyć obejrzane odcinki; postęp zapisujemy na koncie przez API YouTube, gdy odtwarzacz je udostępnia.</p><p>Historia, pozycje, Moja lista i obejrzane wymagają zalogowania kontem społeczności. Gościom nie zapisujemy historii. Do własnych plików służy sekcja „Mój player”.</p><p>Szukaj tytułów seriali w katalogu, a odcinków na stronie konkretnego serialu. Skrót / otwiera wyszukiwanie, Escape zamyka ten panel.</p>`;
  const dialog = document.querySelector("#dialog");
  dialog.innerHTML = `<section class="dialog-box" role="dialog" aria-modal="true" aria-label="${type === "languages" ? "Audio i napisy" : "Informacje o RejStream"}"><button class="dialog-close" aria-label="Zamknij">${icon("x")}</button>${body}</section>`;
  dialog.hidden = false;
  document.body.classList.add("dialog-open");
  createIcons({ icons });
  dialog.querySelector("button").focus();
}
function closeDialog() {
  const d = document.querySelector("#dialog");
  d.hidden = true;
  d.innerHTML = "";
  document.body.classList.remove("dialog-open");
  dialogFocus?.focus();
}
app.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.go) {
    const path = button.dataset.go;
    if (path.startsWith("reset/")) {
      const key = path.split("/")[1];
      filterState[key] = { sort: "asc", language: "all" };
      search = "";
      document.querySelector("#search").value = "";
      render();
    } else go(path);
  }
  if (button.dataset.save) favorite(button.dataset.save);
  if (button.dataset.feature) {
    featured = button.dataset.feature;
    render();
  }
  if (button.dataset.season) {
    seasonState[route()[1]] = button.dataset.season;
    render();
  }
  if (button.dataset.view) {
    view = button.dataset.view;
    store("rej-view", view);
    render();
  }
  if (button.dataset.watched) {
    if (!requireAccount()) return;
    const key = button.dataset.watched;
    watched = watched.includes(key)
      ? watched.filter((x) => x !== key)
      : [...watched, key];
    store("rej-watched", watched);
    if (activeEpisode) {
      const done = watched.includes(key);
      const progress = latestProgress(key);
      button.innerHTML =
        icon(done ? "check-circle-2" : "check") +
        " " +
        (done ? "Obejrzane" : "Oznacz jako obejrzane");
      button.setAttribute("aria-pressed", done);
      document
        .querySelectorAll(".queue-item.current small")
        .forEach((n) => (n.textContent = done ? "Obejrzane" : "Teraz otwarte"));
      createIcons({ icons });
    } else render();
  }
  if (button.dataset.info) showDialog(button.dataset.info, button.dataset.show);
  if (button.classList.contains("dialog-close")) closeDialog();
});
document.querySelector("#help").onclick = () => showDialog("help");
document.querySelector("#sources").onclick = () => showDialog("sources");
document.querySelector("#dialog").onclick = (e) => {
  if (e.target.id === "dialog") closeDialog();
};
const searchInput = document.querySelector("#search");
searchInput.addEventListener("input", (e) => {
  search = e.target.value;
  const page = route()[0];
  if (!["series", "library", "saved"].includes(page)) {
    searchNavigation = true;
    go("library");
  } else render();
});
document.querySelector(".mobile-search").onclick = () => {
  document.querySelector(".topbar").classList.toggle("search-open");
  searchInput.focus();
};
window.addEventListener("hashchange", () => {
  closeDialog();
  if (!searchNavigation) {
    search = "";
    searchInput.value = "";
  }
  searchNavigation = false;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDialog();
    document.querySelector(".topbar").classList.remove("search-open");
  }
  if (
    e.key === "/" &&
    !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
  ) {
    e.preventDefault();
    document.querySelector(".topbar").classList.add("search-open");
    searchInput.focus();
  }
  const dialog = document.querySelector("#dialog");
  if (e.key === "Tab" && !dialog.hidden) {
    const focusables = [
      ...dialog.querySelectorAll("button,a[href],input,select"),
    ];
    const first = focusables[0],
      last = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
function updateAccountAppearance() {
  const accountLink = document.querySelector(".header-avatar");
  const profile = document.querySelector(".profile");
  if (!accountLink || !profile) return;
  const { username, profiles } = account.state();
  const userProfile = profiles[username?.toLowerCase()];
  if (username && !userProfile) account.loadProfile(username);
  accountLink.textContent = username ? username.charAt(0).toUpperCase() : "R";
  accountLink.title = username ? `Konto: ${username}` : "Zaloguj się kontem społeczności";
  accountLink.setAttribute("aria-label", accountLink.title);
  const avatar = profile.querySelector(".avatar");
  avatar.textContent = username ? username.charAt(0).toUpperCase() : "R";
  const avatars = ["comet", "planet", "cat", "fox", "leaf", "cloud", "heart", "spark"];
  if (userProfile && avatars.includes(userProfile.avatar)) {
    const img = document.createElement("img");
    img.src = `https://rejson59.github.io/assets/avatars/${userProfile.avatar}.svg`;
    img.alt = "";
    img.className = "profile-avatar-image";
    avatar.replaceChildren(img);
  }
  const colors = { mint: "#83dfc9", blue: "#a0cdff", violet: "#d5bcff", rose: "#ffaecd", amber: "#f7d18b", slate: "#d1ddeb" };
  const color = Object.hasOwn(colors, userProfile?.color) ? colors[userProfile.color] : "";
  avatar.style.background = color;
  accountLink.style.background = color;
  profile.querySelector(".profile-heading").textContent = username ? `Cześć, ${username}` : "Twój kolejny seans";
  profile.querySelector(".profile-message").textContent = username ? "Twoje historie. Twoje tempo." : "Zaloguj się i zachowaj swoje postępy.";
  profile.setAttribute("aria-label", username ? `Przejdź do profilu: ${username}` : "Zaloguj się i zachowaj swoje postępy");
  if (username) {
    profile.setAttribute("href", `https://rejson59.github.io/profil?u=${encodeURIComponent(username)}`);
    profile.setAttribute("target", "_blank");
    profile.setAttribute("rel", "noopener");
  } else {
    profile.setAttribute("href", "#account");
    profile.removeAttribute("target");
    profile.removeAttribute("rel");
  }
}
let previousUser = account.state().username;
account.subscribe(() => {
  const state = account.state();
  const globalStatus = document.querySelector("#cloud-status");
  if (globalStatus) {
    globalStatus.textContent = state.error;
    globalStatus.hidden = !state.error;
  }
  const status = document.querySelector("#account-error");
  if (status) status.textContent = state.error;
  if (state.username === previousUser) {
    updateAccountAppearance();
    return;
  }
  previousUser = state.username;
  favorites = read("rej-favorites", []);
  watched = read("rej-watched", []);
  recent = [];
  render();
});
account.init();

render();

app.addEventListener(
  "error",
  (e) => {
    if (e.target.tagName === "IMG") {
      e.target.style.opacity = "0";
      e.target.parentElement.classList.add("image-unavailable");
    }
  },
  true,
);
