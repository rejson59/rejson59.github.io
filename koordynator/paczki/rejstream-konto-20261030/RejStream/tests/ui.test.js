// @vitest-environment jsdom
import { it, expect, vi, beforeAll } from "vitest";
const sessionMock = vi.hoisted(() => ({ username: "Test viewer", profiles: {}, onChange: null }));
vi.mock("../account.js", () => ({
  account: {
    state: () => ({ username: sessionMock.username, error: "", profiles: sessionMock.profiles }),
    storage: () => localStorage,
    subscribe: (fn) => { sessionMock.onChange = fn; return () => {}; },
    init: async () => {},
    flush: async () => {},
    loadProfile: async () => null,
  },
}));
const navigate = async (path) => {
  location.hash = path;
  await new Promise((r) => setTimeout(r, 15));
};
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  window.scrollTo = vi.fn();
  await import("../src.js");
});
it("starts with a series catalog and no removed movie", () => {
  expect(document.querySelectorAll(".series-card")).toHaveLength(7);
  expect(document.body.textContent).not.toContain("Big Buck Bunny");
  expect(document.querySelector(".bottom-nav")).not.toBeNull();
});
it("opens circus as a complete numbered season, not a mixed homepage", async () => {
  await navigate("series/circus");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(9);
  expect(document.querySelectorAll(".series-card")).toHaveLength(0);
  expect(document.querySelector(".episode h3").textContent).toBe(
    "Pilot / PILOT",
  );
});
it("sorts episodes descending and preserves audio filter across re-renders", () => {
  const sort = document.querySelector("#episode-sort");
  sort.value = "desc";
  sort.dispatchEvent(new Event("change"));
  expect(document.querySelector(".episode h3").textContent).toBe(
    "Pamiętaj / Remember",
  );
  const audio = document.querySelector("#audio-filter");
  audio.value = "fandub";
  audio.dispatchEvent(new Event("change"));
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(0);
  document.querySelector('[data-go="reset/circus"]').click();
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(9);
});
it("switches Helluva seasons without mixing pilot numbering", async () => {
  await navigate("series/helluva");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(8);
  document.querySelector('[data-season="2"]').click();
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(12);
  document.querySelector('[data-season="special"]').click();
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(2);
});
it("saves series and shows a dedicated favorites collection", async () => {
  await navigate("series/circus");
  document.querySelector('[data-save="circus"]').click();
  await navigate("saved");
  expect(document.querySelectorAll(".series-card")).toHaveLength(1);
  expect(document.querySelector(".series-card h3").textContent).toBe(
    "The Amazing Digital Circus",
  );
});
it("offers the actual Polish fandub and source link", async () => {
  await navigate("watch/helluva/1/1");
  const audio = document.querySelector("#audio");
  audio.value = "pl";
  audio.dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe").src).toContain("4DjfKP5w8Ps");
  expect(document.querySelector("#youtube-link").href).toContain("4DjfKP5w8Ps");
  const sub = document.querySelector("#subs");
  sub.value = "pl";
  sub.dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe").src).toContain("cc_lang_pref=pl");
});
it("does not reload player when marking watched; persists manual status", () => {
  const frame = document.querySelector("iframe");
  document.querySelector("[data-watched]").click();
  expect(document.querySelector("iframe")).toBe(frame);
  expect(JSON.parse(localStorage.getItem("rej-watched"))).toContain(
    "helluva:1:1",
  );
});
it("shows all nine episodes alongside circus player with working next link", async () => {
  await navigate("watch/circus/1/1");
  expect(document.querySelectorAll(".queue-item")).toHaveLength(9);
  expect(document.querySelector(".episode-navigation a:last-child").hash).toBe(
    "#watch/circus/1/2",
  );
  expect(document.querySelector('#audio option[value="pl"]')).toBeNull();
});
it("shows external-only episodes without a fake stream", async () => {
  await navigate("watch/helluva/3/1");
  expect(document.querySelector("iframe")).toBeNull();
  expect(document.querySelector(".external-player a").href).toContain(
    "primevideo.com",
  );
});
it("opens local player and disposes it when navigating away", async () => {
  await navigate("local");
  expect(document.querySelector("video")).not.toBeNull();
  expect(document.querySelector(".local-subs").accept).toBe(".vtt,.srt");
  await navigate("home");
  expect(document.querySelector("video")).toBeNull();
  expect(document.querySelector(".recent-card")).not.toBeNull();
});
it("clears catalog search when moving to a series, so its episodes remain visible", async () => {
  await navigate("library");
  const input = document.querySelector("#search");
  input.value = "digital";
  input.dispatchEvent(new Event("input"));
  expect(document.querySelectorAll(".series-card")).toHaveLength(1);
  await navigate("series/circus");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(9);
  expect(input.value).toBe("");
});
it("displays and closes audio guidance and returns focus", () => {
  const trigger = document.querySelector('[data-info="languages"]');
  trigger.focus();
  trigger.click();
  expect(document.querySelector("#dialog").hidden).toBe(false);
  expect(document.querySelector('[role="dialog"]').textContent).toContain(
    "Ścieżkę dźwiękową",
  );
  document.querySelector(".dialog-close").click();
  expect(document.querySelector("#dialog").hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
});
it("handles unknown routes and unknown episodes gracefully", async () => {
  await navigate("watch/circus/1/999");
  expect(document.querySelector(".empty-state")).not.toBeNull();
  await navigate("unknown");
  expect(document.querySelector(".empty-state")).not.toBeNull();
});

it("defaults to credited Polish material and remembers an explicit original preference", async () => {
  localStorage.removeItem("rej-prefer-polish-v2");
  await navigate("watch/helluva/1/2");
  expect(document.querySelector("#audio").value).toBe("pl");
  expect(document.querySelector("iframe").src).toContain("jamGQ6oBo4w");
  expect(document.querySelector("#audio-credit a").href).toContain(
    "@BruDolinaStudios",
  );
  const audio = document.querySelector("#audio");
  audio.value = "original";
  audio.dispatchEvent(new Event("change"));
  expect(document.querySelector("#playback-source").textContent).toContain(
    "SpindleHorse",
  );
  await navigate("watch/helluva/1/3");
  expect(document.querySelector("#audio").value).toBe("original");
  document.querySelector("#audio").value = "pl";
  document.querySelector("#audio").dispatchEvent(new Event("change"));
  await navigate("watch/helluva/1/4");
  expect(document.querySelector("#audio").value).toBe("pl");
  expect(document.querySelector("iframe").src).toContain("F-MT37XoLyM");
});
it("lets the viewer choose an alternate credited Polish fandub", async () => {
  await navigate("watch/helluva/1/1");
  const audio = document.querySelector("#audio");
  audio.value = "pl:QxXceYy-tbw";
  audio.dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe").src).toContain("QxXceYy-tbw");
  expect(document.querySelector("#playback-source").textContent).toContain(
    "BruDolina",
  );
  expect(document.querySelector("#youtube-link").href).toContain("QxXceYy-tbw");
});
it("labels lektor separately and gives genuine gaps no Polish source option", async () => {
  await navigate("watch/helluva/2/2");
  expect(document.querySelector(".polish-notice.lektor")).not.toBeNull();
  expect(
    document.querySelector('#audio option[value="pl"]').textContent,
  ).toContain("lektor (nie dubbing)");
  expect(document.querySelector("#playback-source").textContent).toContain(
    "Keisuken",
  );
  expect(document.querySelector("iframe").src).toContain("9YvbfmfQTSY");
  await navigate("watch/helluva/2/12");
  expect(document.querySelector(".polish-notice.missing")).not.toBeNull();
  expect(document.querySelector('#audio option[value="pl"]')).toBeNull();
  expect(document.querySelector(".polish-notice a").href).toContain(
    "primevideo.com",
  );
});
it("shows age-restricted Polish audio as an external link with original fallback", async () => {
  await navigate("watch/helluva/2/1");
  expect(document.querySelector("iframe")).toBeNull();
  expect(document.querySelector(".external-player a").href).toContain(
    "SL6o757ljFM",
  );
  expect(document.querySelector(".external-player").textContent).toContain(
    "ograniczenie wieku",
  );
  document.querySelector("#audio").value = "original";
  document.querySelector("#audio").dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe")).not.toBeNull();
});
it("explains official Polish audio without claiming to control YouTube tracks", async () => {
  await navigate("watch/drones/1/1");
  expect(
    document.querySelector(".polish-notice.official").textContent,
  ).toContain("nie przełącza tej ścieżki automatycznie");
  expect(document.querySelectorAll("#audio option")).toHaveLength(1);
  expect(document.querySelector("iframe").src).toContain("mImFz8mkaHo");
  await navigate("series/circus");
  expect(document.querySelectorAll(".pl-label")).toHaveLength(9);
  const filter = document.querySelector("#audio-filter");
  filter.value = "polish";
  filter.dispatchEvent(new Event("change"));
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(9);
  expect(document.querySelector("#audio-filter").value).toBe("polish");
});

it("defaults captions to Polish even on official multi-audio uploads", async () => {
  await navigate("watch/circus/1/2");
  expect(document.querySelector("#subs").value).toBe("pl");
  const url = new URL(document.querySelector("iframe").src);
  expect(url.searchParams.get("hl")).toBe("pl");
  expect(url.searchParams.get("cc_load_policy")).toBe("1");
  expect(url.searchParams.get("cc_lang_pref")).toBe("pl");
  document.querySelector("#subs").value = "";
  document.querySelector("#subs").dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe").src).toBe(url.href);
  expect(document.querySelector("#subs").value).toBe("");
});
it("resets legacy English preference once for the new Polish-first defaults", async () => {
  localStorage.setItem("rej-prefer-polish", "false");
  localStorage.removeItem("rej-prefer-polish-v2");
  await navigate("watch/helluva/1/5");
  expect(document.querySelector("#audio").value).toBe("pl");
  expect(document.querySelector("#subs").value).toBe("pl");
});
it("embeds the Polish trailer immediately below each series description, not a navigation button", async () => {
  for (const [show, id] of [
    ["circus", "rrz4UYIs8h4"],
    ["helluva", "DUD6S1XBVUI"],
    ["drones", "TvayzJG0BS8"],
  ]) {
    await navigate(`series/${show}`);
    if (show === "helluva") document.querySelector('[data-season="2"]').click();
    const figure = document.querySelector(
      ".series-description + .inline-trailer",
    );
    expect(figure).not.toBeNull();
    const frame = figure.querySelector("iframe");
    expect(frame.title.toLowerCase()).toContain("zwiastun");
    const url = new URL(frame.src);
    expect(url.pathname).toContain(id);
    expect(url.searchParams.get("cc_lang_pref")).toBe("pl");
    expect(url.searchParams.has("autoplay")).toBe(false);
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(figure.querySelector("figcaption a").href).toContain(
      "youtube.com/@",
    );
    expect(
      document.querySelector('.hero-actions a[href^="#trailer/"]'),
    ).toBeNull();
  }
  await navigate("home");
  expect(
    document.querySelector(".spotlight-copy > p + .inline-trailer iframe"),
  ).not.toBeNull();
  expect(
    document.querySelector('.hero-actions a[href^="#trailer/"]'),
  ).toBeNull();
});
it("opens all three Polish-dubbed trailer uploads without polluting viewing history", async () => {
  const recent = localStorage.getItem("rej-recent");
  for (const [show, id] of [
    ["circus", "rrz4UYIs8h4"],
    ["helluva", "DUD6S1XBVUI"],
    ["drones", "TvayzJG0BS8"],
  ]) {
    await navigate(`trailer/${show}`);
    const url = new URL(document.querySelector("iframe").src);
    expect(url.pathname).toContain(id);
    expect(url.searchParams.get("cc_lang_pref")).toBe("pl");
    expect(document.querySelector("#youtube-link").href).toContain(id);
    expect(document.querySelector(".trailer-credit a").href).toContain(
      "youtube.com/@",
    );
    expect(document.querySelector(".polish-notice").textContent).toContain(
      show === "helluva"
        ? "nieoficjalny fandub"
        : "oficjalnego polskiego dubbingu",
    );
  }
  expect(localStorage.getItem("rej-recent")).toBe(recent);
  const frame = document.querySelector("iframe");
  document.querySelector("#subs").value = "en";
  document.querySelector("#subs").dispatchEvent(new Event("change"));
  expect(document.querySelector("iframe")).toBe(frame);
  expect(document.querySelector("#subs").value).toBe("en");
  await navigate("series/drones");
  expect(document.querySelector(".trailer-section")).toBeNull();
  expect(document.querySelectorAll(".inline-trailer iframe")).toHaveLength(1);
});
it("uses the original vector brand mark in navigation and footer", () => {
  expect(
    document.querySelectorAll('img[src="./rejstream-mark.svg"]'),
  ).toHaveLength(3);
  expect(
    document.querySelector(".mobile-brand").getAttribute("aria-label"),
  ).toContain("RejStream");
});

it("changes the inline trailer with the selected season and hides absent trailers", async () => {
  await navigate("series/helluva");
  document.querySelector('[data-season="2"]').click();
  expect(document.querySelector(".inline-trailer iframe").src).toContain(
    "DUD6S1XBVUI",
  );
  document.querySelector('[data-season="3"]').click();
  expect(document.querySelector(".inline-trailer iframe").src).toContain(
    "qhE0XE__ZD0",
  );
  for (const season of ["1", "shorts", "special"]) {
    document.querySelector(`[data-season="${season}"]`).click();
    expect(document.querySelector(".inline-trailer")).toBeNull();
  }
});
it("starts an upload at its own saved second and reports per-episode progress", async () => {
  localStorage.setItem(
    "rej-playback-v1",
    JSON.stringify({
      "youtube:circus:1:1:HwAPLk_sQ3w": {
        episode: "circus:1:1",
        label: "Circus — Pilot",
        position: 83.75,
        seconds: 62,
        duration: 1500,
        updated: Date.now(),
      },
    }),
  );
  await navigate("watch/circus/1/1");
  const url = new URL(document.querySelector("#episode-player").src);
  expect(url.searchParams.get("start")).toBe("83");
  expect(url.searchParams.get("enablejsapi")).toBe("1");
  expect(document.querySelector("#watch-progress").textContent).toContain(
    "1:23",
  );
  await navigate("home");
  expect(document.querySelector(".local-progress")).toBeNull();
  expect(document.body.textContent).not.toContain("Twój czas z historiami");
  await navigate("history");
  expect(document.querySelector(".history-item").textContent).toContain(
    "The Amazing Digital Circus — Pilot / PILOT",
  );
  expect(document.querySelector(".history-item progress").value).toBe(83.75);
  expect(document.querySelector(".history-item a").hash).toBe(
    "#watch/circus/1/1",
  );
  expect(
    document
      .querySelector('.bottom-nav [data-nav="history"]')
      .getAttribute("aria-current"),
  ).toBe("page");
});

it("renders a position bar and timestamp instead of cumulative watched text", async () => {
  await navigate("series/circus");
  const card = document.querySelector('[data-episode="circus:1:1"]');
  expect(card.querySelector(".position-progress progress").value).toBe(83.75);
  expect(card.querySelector(".position-time").textContent).toBe("1:23");
  expect(card.textContent).not.toContain("Widziano");
  await navigate("watch/circus/1/1");
  expect(document.querySelector("#watch-progress progress").max).toBe(1500);
});
it("applies subtitle choices through the API without replacing the iframe or its playback time", async () => {
  let events,
    track = { languageCode: "en" };
  const player = {
    getDuration: () => 1500,
    getCurrentTime: () => 83,
    getPlaybackRate: () => 1,
    getOption: () => track,
    loadModule: vi.fn(),
    setOption: vi.fn((m, o, v) => {
      track = v;
    }),
    destroy: vi.fn(),
  };
  window.YT = {
    Player: function (frame, options) {
      events = options.events;
      return player;
    },
  };
  await navigate("watch/circus/1/2");
  events.onReady({ target: player });
  expect(track.languageCode).toBe("pl");
  const frame = document.querySelector("#episode-player");
  document.querySelector("#subs").value = "en";
  document.querySelector("#subs").dispatchEvent(new Event("change"));
  expect(track.languageCode).toBe("en");
  expect(document.querySelector("#episode-player")).toBe(frame);
  expect(player.destroy).not.toHaveBeenCalled();
  await navigate("local");
  expect(player.destroy).toHaveBeenCalledOnce();
  delete window.YT;
});

it("shows an honest empty history and no statistics in the local player", async () => {
  const saved = localStorage.getItem("rej-playback-v1");
  localStorage.removeItem("rej-playback-v1");
  await navigate("history");
  expect(document.querySelector("#content").textContent).toContain(
    "Jeszcze nic tu nie ma",
  );
  await navigate("local");
  expect(document.querySelector(".local-progress")).toBeNull();
  if (saved) localStorage.setItem("rej-playback-v1", saved);
});

it("does not advertise login to signed-in viewers", async () => {
  await navigate("home");
  expect(document.querySelector(".login-nudge")).toBeNull();
  await navigate("watch/circus/1/2");
  expect(document.querySelector(".login-nudge")).toBeNull();
  expect(document.querySelector(".watch-title-row h1").textContent).toContain(
    "Cukierkowy konwój chaosu!",
  );
  expect(
    document.querySelector(".title-translation-note").textContent,
  ).toContain("nie oficjalny");
});

it("does not expose the rejected LEGO titles or players through old links", async () => {
  await navigate("library");
  expect(document.querySelectorAll(".series-card")).toHaveLength(7);
  expect(document.querySelector("#content").textContent).not.toContain("LEGO");
  for (const key of ["lego-spider", "lego-ninjago"]) {
    await navigate(`series/${key}`);
    expect(document.querySelector("#content").textContent).toContain(
      "Ta strona nie istnieje",
    );
    await navigate(`watch/${key}/1/1`);
    expect(document.querySelector("#episode-player")).toBeNull();
  }
});
it("hides obsolete catalog history without deleting account records or local-file history", async () => {
  const old = localStorage.getItem("rej-playback-v1");
  const fixture = {
    removed: {
      episode: "lego-spider:1:1",
      label: "Rejected LEGO",
      position: 10,
      seconds: 3,
      duration: 100,
      updated: 1,
    },
    local: {
      episode: "local:example",
      label: "My local file",
      position: 10,
      seconds: 3,
      duration: 100,
      updated: 1,
    },
  };
  localStorage.setItem("rej-playback-v1", JSON.stringify(fixture));
  await navigate("history");
  expect(document.querySelector("#content").textContent).not.toContain(
    "Rejected LEGO",
  );
  expect(document.querySelector("#content").textContent).toContain(
    "My local file",
  );
  expect(JSON.parse(localStorage.getItem("rej-playback-v1"))).toEqual(fixture);
  if (old) localStorage.setItem("rej-playback-v1", old);
  else localStorage.removeItem("rej-playback-v1");
});

it("opens Meta Runner and its actual episode routes without invented Polish audio", async () => {
  await navigate("series/meta-runner");
  expect(document.body.textContent).toContain("Animated Movie Cut");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(1);
  expect(document.body.textContent).not.toContain(
    "Kompletny serial: 8 odcinków",
  );
  await navigate("watch/meta-runner/2/1");
  expect(document.querySelector(".watch-title-row h1").textContent).toContain(
    "Twardy reset",
  );
  expect(document.querySelectorAll(".queue-item")).toHaveLength(10);
  expect(document.querySelector("#audio option[value=pl]")).toBeNull();
  expect(
    document.querySelector('a[href="#watch/meta-runner/2/2"]'),
  ).not.toBeNull();
  await navigate("watch/meta-runner/3/8");
  expect(document.querySelector(".watch-title-row h1").textContent).toContain(
    "Koniec",
  );
  expect(document.querySelectorAll(".queue-item")).toHaveLength(8);
});

it("plays newly added shorts with stable numbering and previous/next navigation", async () => {
  await navigate("watch/helluva/shorts/2");
  expect(document.querySelector(".watch-title-row h1").textContent).toContain(
    "Antarktyda",
  );
  expect(document.querySelectorAll(".queue-item")).toHaveLength(14);
  expect(
    document.querySelector(
      '.episode-navigation a[href="#watch/helluva/shorts/1"]',
    ),
  ).not.toBeNull();
  expect(
    document.querySelector(
      '.episode-navigation a[href="#watch/helluva/shorts/3"]',
    ),
  ).not.toBeNull();
  await navigate("watch/helluva/shorts/14");
  expect(document.querySelector(".watch-title-row h1").textContent).toContain(
    "Księżniczka",
  );
  expect(
    document.querySelector(
      '.episode-navigation a[href="#watch/helluva/shorts/15"]',
    ),
  ).toBeNull();
  expect(document.querySelector("#audio option[value=pl]")).toBeNull();
});

it("shows the calculated marathon trivia on home with an honest external breakdown", async () => {
  await navigate("home");
  const trivia = document.querySelector(".runtime-trivia");
  expect(trivia.textContent).toContain("7 tytułów");
  expect(trivia.textContent).toContain("30 godz. 25 min");
  expect(trivia.textContent).toContain("Prime Video");
  expect(trivia.querySelector("details")).not.toBeNull();
});


it("updates desktop account messaging on login, logout and restored sessions", async () => {
  await navigate("home");
  const profile = document.querySelector(".profile");
  expect(profile.getAttribute("href")).toContain("rejson59.github.io/profil?u=");
  expect(profile.textContent).toContain("Cześć, Test viewer");
  expect(profile.textContent).toContain("Twoje historie. Twoje tempo.");
  expect(profile.querySelector(".avatar").textContent).toBe("T");
  sessionMock.username = null;
  sessionMock.onChange();
  expect(profile.getAttribute("href")).toBe("#account");
  expect(profile.textContent).toContain("Zaloguj się i zachowaj swoje postępy.");
  expect(profile.textContent).not.toContain("Test viewer");
  expect(profile.querySelector(".avatar").textContent).toBe("R");
  sessionMock.username = '<Nowy & widz>';
  sessionMock.onChange();
  expect(profile.querySelector(".profile-heading").textContent).toBe("Cześć, <Nowy & widz>");
  expect(profile.querySelector("nowy")).toBeNull();
  sessionMock.username = "Test viewer";
  sessionMock.onChange();
  expect(document.body.textContent).not.toMatch(/Bez konta|Bez zakładania konta/i);
});

it("updates shared profile appearance without restarting the player", async () => {
  await navigate("watch/circus/1/1");
  const player = document.querySelector("#episode-player");
  sessionMock.profiles["test viewer"] = { avatar: "cat", color: "rose" };
  sessionMock.onChange();
  expect(document.querySelector("#episode-player")).toBe(player);
  expect(document.querySelector(".profile .avatar img").src).toBe("https://rejson59.github.io/assets/avatars/cat.svg");
  expect(document.querySelector(".profile").href).toContain("rejson59.github.io/profil?u=Test%20viewer");
  sessionMock.profiles["test viewer"] = { avatar: '<img src=x onerror=alert(1)>', color: 'red' };
  sessionMock.onChange();
  expect(document.querySelector(".profile .avatar img")).toBeNull();
  delete sessionMock.profiles["test viewer"];
});

it("recommends an intro before Helluva seasons and bridges season boundaries", async () => {
  await navigate("series/helluva");
  expect(document.querySelector('.series-hero [data-go]').dataset.go).toBe("watch/helluva/special/2");
  const guide = document.querySelector(".watch-order");
  expect(guide.textContent).toContain("poza aktualnym kanonem");
  expect(guide.textContent).toContain("najlepiej po sezonie 2");
  expect(guide.querySelector("a").getAttribute("href")).toBe("#watch/helluva/special/2");
  await navigate("watch/helluva/special/2");
  expect(document.querySelector('.episode-navigation .primary').getAttribute("href")).toBe("#watch/helluva/1/1");
  await navigate("watch/helluva/1/1");
  expect(document.querySelector('.episode-navigation .secondary').getAttribute("href")).toBe("#watch/helluva/special/2");
  await navigate("watch/helluva/1/8");
  expect(document.querySelector('.episode-navigation .primary').getAttribute("href")).toBe("#watch/helluva/2/1");
  await navigate("watch/helluva/2/12");
  expect(document.querySelector('.episode-navigation .primary').textContent).toContain("Prime Video (zewnętrznie)");
  await navigate("series/meta-runner");
  expect(document.querySelector(".watch-order").textContent).toContain("nie 10 oryginalnych odcinków");
});


it("opens Metal Family with ordered seasons, credited Polish audio and honest gaps", async () => {
  await navigate("series/metal-family");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(10);
  expect(document.querySelector(".watch-order").textContent).toContain("Sezon 2 nadal trwa");
  expect(document.querySelector(".language-strip").textContent).toContain("oficjalny dubbing angielski");
  expect(document.querySelector(".inline-trailer")).toBeNull();
  document.querySelector('[data-season="2"]').click();
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(7);
  await navigate("watch/metal-family/1/1");
  expect(document.querySelector("#episode-player").src).toContain("Tis9tqJb4qA");
  expect(document.querySelector("#audio").value).toBe("pl");
  expect(document.querySelector("#audio-credit").textContent).toContain("BruDolina");
  await navigate("watch/metal-family/1/10");
  expect(document.querySelector("#episode-player").src).toContain("HO33O2-DYYY");
  expect(document.querySelector('#audio option[value="pl"]')).toBeNull();
  expect(document.querySelector('.episode-navigation .primary').getAttribute("href")).toBe("#watch/metal-family/2/1");
  await navigate("watch/metal-family/2/7");
  expect(document.querySelector("#episode-player").src).toContain("SSxZ5vorJNA");
  expect(document.querySelector(".episode-navigation").textContent).toContain("Wróć do serialu");
});


it("adds honest pilot collections for Lackadaisy and Gameoverse with working routes", async () => {
  await navigate("series/lackadaisy");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(1);
  expect(document.querySelector(".availability-note").textContent).toContain("nie dodajemy zapowiedzi");
  expect(document.querySelector(".watch-order").textContent).toContain("Najpierw pełny pilot");
  expect(document.querySelector(".language-strip").textContent).not.toContain("Oficjalny polski dubbing");
  document.querySelector('[data-season="shorts"]').click();
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(5);
  await navigate("watch/lackadaisy/1/1");
  expect(document.querySelector("#episode-player").src).toContain("TOu1f4fnhDs");
  expect(document.querySelector(".queue-heading h2").textContent).toBe("Pilot");
  expect(document.querySelector('#audio option[value="pl"]')).not.toBeNull();
  await navigate("watch/lackadaisy/shorts/1");
  expect(document.querySelector("#episode-player").src).toContain("GqkUy8M-GfQ");
  expect(document.querySelector(".queue-heading h2").textContent).toBe("Krótkie animacje");
  await navigate("series/gameoverse");
  expect(document.querySelectorAll("[data-episode]")).toHaveLength(1);
  expect(document.querySelector(".availability-note").textContent).toContain("1 pilot");
  expect(document.querySelector(".inline-trailer")).toBeNull();
  await navigate("watch/gameoverse/1/1");
  expect(document.querySelector("#episode-player").src).toContain("1jNk5tmjhpc");
  expect(document.querySelector(".polish-notice").textContent).toContain("Oficjalny polski dubbing");
  expect(document.querySelector(".queue-heading h2").textContent).toBe("Pilot");
  expect(document.querySelector(".episode-navigation").textContent).toContain("Wróć do serialu");
});


it("uses the requested recommended ranking on home and library, with alphabetical sort still working", async () => {
  const expected = ["The Amazing Digital Circus", "Helluva Boss", "Metal Family", "Gameoverse", "Murder Drones", "Lackadaisy", "Meta Runner"];
  const titles = () => [...document.querySelectorAll(".series-card h3")].map((el) => el.textContent);
  await navigate("home");
  expect(titles()).toEqual(expected);
  await navigate("library");
  const sort = document.querySelector("#catalog-sort");
  sort.value = "recommended";
  sort.dispatchEvent(new Event("change"));
  expect(titles()).toEqual(expected);
  document.querySelector("#catalog-sort").value = "az";
  document.querySelector("#catalog-sort").dispatchEvent(new Event("change"));
  expect(titles()).toEqual([...expected].sort((a,b) => a.localeCompare(b)));
  document.querySelector("#catalog-sort").value = "recommended";
  document.querySelector("#catalog-sort").dispatchEvent(new Event("change"));
  expect(titles()).toEqual(expected);
});
it("defaults newly verified fandubs to Polish and retains the original option", async () => {
  for (const [route, id] of [
    ["helluva/shorts/2", "6UpLvD-5TOI"],
    ["metal-family/1/7", "frbUzuwa6fU"],
    ["metal-family/1/8", "ZUWca9_fDJQ"],
    ["metal-family/1/9", "ScYy3QZIRHU"],
    ["metal-family/2/6", "ZgDr_d7gc_k"],
    ["lackadaisy/1/1", "TOu1f4fnhDs"],
    ["lackadaisy/shorts/4", "hCDXd3a-tyM"],
  ]) {
    await navigate(`watch/${route}`);
    expect(document.querySelector("#episode-player").src).toContain(id);
    expect(document.querySelector("#audio").value).toBe("pl");
    expect(document.querySelector('#audio option[value="original"]')).not.toBeNull();
    expect(document.querySelector(".polish-notice.fandub")).not.toBeNull();
  }
});

it("uses dedicated series artwork rather than episode stills on cards and title pages", async () => {
  await navigate("home");
  const cards = [...document.querySelectorAll(".series-cover")];
  expect(cards).toHaveLength(7);
  for (const card of cards) {
    expect(card.querySelector("img").alt).toContain("grafika promocyjna");
    expect(card.querySelector(".cover-title").textContent).toBeTruthy();
  }
  const metal = document.querySelector('a.series-cover[href="#series/metal-family"] img');
  expect(metal.src).toContain("/covers/metal-family.jpg");
  expect(metal.src).not.toContain("UHOIUzk6XF8");
  await navigate("series/meta-runner");
  expect(document.querySelector(".series-hero-art").src).toContain("/covers/meta-runner.jpg");
  await navigate("watch/meta-runner/1/1");
  expect(document.querySelector(".queue-item img").src).toContain("HmKcvlLxGqo");
});
