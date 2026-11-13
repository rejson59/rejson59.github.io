/**
 * RejHub — pobieranie aplikacji Android bez wychodzenia z RejHuba.
 *
 * Po co to jest:
 *   GitHub wydaje plik z adresu `github.com/.../releases/latest/download/RejHub.apk`,
 *   ale to zwykłe przekierowanie: przeglądarka (a szczególnie Chrome na
 *   Androidzie i WebView aplikacji) potrafi pokazać po drodze stronę wydania
 *   zamiast od razu zapisać plik. Tutaj plik wychodzi **z naszej domeny**,
 *   z nagłówkiem `Content-Disposition: attachment`, więc pobieranie startuje
 *   natychmiast — i w przeglądarce, i w aplikacji (systemowy menedżer
 *   pobierania dostaje plik `RejHub.apk`).
 *
 * Adres publiczny: `/app/RejHub.apk` (przepisany tutaj w `vercel.json`).
 *
 * Jak działa:
 *   1. Pobiera najnowsze wydanie z GitHuba (serwer → serwer, bez przeglądarki).
 *   2. Przekazuje plik strumieniem — 6 MB nie przechodzi przez pamięć funkcji
 *      i nie wpada w limit 4,5 MB dla zwykłych odpowiedzi.
 *   3. Przekazuje `Range`, więc przerwane pobieranie można wznowić.
 *   4. Gdy GitHub jest chwilowo niedostępny, oddaje przekierowanie na źródło,
 *      żeby pobieranie nigdy nie stanęło w miejscu.
 *
 * Plik nie jest nigdzie kopiowany — zawsze to najnowsze wydanie.
 */

const SOURCE =
  "https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk";
const FILENAME = "RejHub.apk";
const CONTENT_TYPE = "application/vnd.android.package-archive";
const CACHE = "public, max-age=0, must-revalidate";

/* Pobieranie strumieniowe może trwać dłużej niż domyślne 10 s — szczególnie
   na wolnym łączu mobilnym. 60 s to bezpieczne maksimum dla planu Hobby. */
export const config = { maxDuration: 60 };

function fallback(response) {
  /* Ostatnia deska ratunku: skoro nie umiemy podać pliku, niech przeglądarka
     spróbuje sama. Lepiej skok na GitHuba niż martwy przycisk. */
  response.statusCode = 302;
  response.setHeader("Location", SOURCE);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Przekierowanie do wydania RejHuba.\n");
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const headers = {
    "user-agent": "RejHub-download/1.0 (+https://rejhub.vercel.app)",
    accept: "*/*"
  };

  /* Wznawianie pobrania (DownloadManager, przeglądarki) — przekazujemy dalej. */
  const range = request.headers && request.headers.range;
  if (range) headers.range = range;

  let upstream = null;
  try {
    upstream = await fetch(SOURCE, {
      method: request.method,
      redirect: "follow",
      headers
    });
  } catch (error) {
    upstream = null;
  }

  if (!upstream || (upstream.status !== 200 && upstream.status !== 206)) {
    fallback(response);
    return;
  }

  response.statusCode = upstream.status;
  response.setHeader("Content-Type", CONTENT_TYPE);
  response.setHeader(
    "Content-Disposition",
    'attachment; filename="' + FILENAME + '"; filename*=UTF-8\'\'' + FILENAME
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", CACHE);

  /* Rozmiar i zakres bierzemy ze źródła — dzięki temu pasek postępu
     w przeglądarce i w menedżerze pobierania pokazuje prawdę. */
  ["content-length", "content-range", "last-modified", "etag"].forEach(function (name) {
    const value = upstream.headers.get(name);
    if (value) {
      response.setHeader(
        name.replace(/(^|-)([a-z])/g, function (_, dash, letter) {
          return dash + letter.toUpperCase();
        }),
        value
      );
    }
  });

  if (request.method === "HEAD" || !upstream.body) {
    response.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!response.write(Buffer.from(chunk.value))) {
        await new Promise(function (resolve) {
          response.once("drain", resolve);
        });
      }
    }
  } catch (error) {
    /* Klient zamknął kartę albo przerwał pobieranie — to normalne. */
  } finally {
    try {
      response.end();
    } catch (error) {
      /* po zerwaniu połączenia kończenie odpowiedzi też może rzucić */
    }
  }
}
