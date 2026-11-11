/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — plakaty projektów (v1).
 *
 * Zamiast trzymać w karcie żywy dokument w <iframe> (własne skrypty, animacje,
 * WebGL — kilkanaście niezależnych pętli animacji na jednej stronie), karta
 * dostaje od razu gotowy plakat: wektorowy, ostry na każdym ekranie, ważony
 * kilka kilobajtów i rysowany w całości przez przeglądarkę bez ani jednego
 * żądania sieciowego.
 *
 * Plakat bierze PRAWDZIWE dane projektu (nazwa, opis, język, tematy, adres)
 * i składa je w spójną kompozycję: etykieta kategorii, gradientowa „zorza”,
 * siatka, motyw graficzny dobrany do typu projektu i stopka z CTA.
 *
 * Plakat jest warstwą POD ramką: gdy na mocnym komputerze podgląd na żywo
 * zdąży się wczytać, ramka zasłania plakat. Gdy ramka zostanie zwolniona
 * (albo nigdy nie wystartuje, np. na telefonie), plakat jest już na miejscu —
 * nie ma czarnego prostokąta, migotania ani pustki.
 *
 * API:
 *   RJPosters.build(project, { variant: 'land'|'port' })  → string SVG
 *   RJPosters.decorate(cardPreviewElement)                → dodaje plakat
 *   RJPosters.attach(root)                                → skanuje drzewo
 *   RJPosters.refresh()                                   → przerysowuje po zmianie układu
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uid = 0;

  /* ---------- dane ---------- */

  function text(node) {
    return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function fromCard(card) {
    var nameNode = card.querySelector('.card-title a, .card-title, h3');
    var descNode = card.querySelector('.card-desc');
    var langNode = card.querySelector('.lang');
    var link = card.querySelector('.card-preview[href]');
    var topics = [];
    card.querySelectorAll('.card-topics li').forEach(function (item) {
      var value = text(item);
      if (value) topics.push(value);
    });
    if (langNode) {
      /* „● JavaScript” → „JavaScript” (kropka to osobny element) */
      var clone = langNode.cloneNode(true);
      var dot = clone.querySelector('.lang-dot');
      if (dot) dot.remove();
      var language = text(clone);
      return {
        name: text(nameNode) || card.getAttribute('data-repo') || '',
        description: text(descNode),
        language: language,
        topics: topics,
        domain: link ? String(link.getAttribute('href') || '').replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
      };
    }
    return {
      name: text(nameNode) || card.getAttribute('data-repo') || '',
      description: text(descNode),
      language: '',
      topics: topics,
      domain: link ? String(link.getAttribute('href') || '').replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
    };
  }

  /* ---------- kategoria, kolor, motyw ---------- */

  var CATEGORIES = [
    { test: /gra|game|minecraft|mconline|joypad|pad|mine|kostk/i, hue: 264, label: 'GRA', motif: 'cube' },
    { test: /czat|chat|rozmow|spoleczn|social|offchat/i, hue: 206, label: 'ROZMOWY', motif: 'chat' },
    { test: /stream|film|wideo|video|serial|player|muzyk|music|jakup/i, hue: 286, label: 'MEDIA', motif: 'play' },
    { test: /szuk|search|wyszukiw/i, hue: 194, label: 'SZUKANIE', motif: 'search' },
    { test: /nauk|szkol|student|class|bio|ucz|prostudent/i, hue: 212, label: 'NAUKA', motif: 'learn' },
    { test: /anim|vibe|motion/i, hue: 274, label: 'ANIMACJE', motif: 'orbit' },
    { test: /plik|file|sejf|safe|bezpiec|narzęd|tool/i, hue: 188, label: 'NARZĘDZIA', motif: 'file' }
  ];

  function hash(value) {
    var out = 0;
    for (var i = 0; i < value.length; i += 1) {
      out = (out * 31 + value.charCodeAt(i)) % 100000;
    }
    return out;
  }

  function category(project) {
    var haystack = [project.name, project.description]
      .concat(project.topics || [])
      .join(' ');
    for (var i = 0; i < CATEGORIES.length; i += 1) {
      if (CATEGORIES[i].test.test(haystack)) return CATEGORIES[i];
    }
    return { hue: 200 + (hash(String(project.name || '')) % 78), label: 'PROJEKT', motif: 'window' };
  }

  function hsl(hue, saturation, lightness, alpha) {
    var base = hue < 0 ? hue + 360 : hue % 360;
    var value = 'hsl(' + Math.round(base) + ',' + saturation + '%,' + lightness + '%)';
    return typeof alpha === 'number' ? value.replace('hsl(', 'hsla(').replace('%)', '%,' + alpha + ')') : value;
  }

  /* ---------- tekst ---------- */

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function chunkWord(word, limit) {
    if (word.length <= limit) return [word];
    /* Jedno bardzo długie słowo (np. nazwa bez spacji) dzielimy z myślnikiem,
       żeby nie wystawało poza kadr ani nie wyglądało jak urwane w połowie. */
    var room = Math.max(4, limit - 1);
    var parts = [];
    var rest = word;
    while (rest.length > limit) {
      parts.push(rest.slice(0, room) + '-');
      rest = rest.slice(room);
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function wrap(value, limit, maxLines) {
    var words = [];
    String(value || '').replace(/\s+/g, ' ').trim().split(' ').forEach(function (word) {
      if (!word) return;
      chunkWord(word, limit).forEach(function (part) { words.push(part); });
    });
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i += 1) {
      var word = words[i];
      if (!word) continue;
      var candidate = current ? current + ' ' + word : word;
      if (candidate.length <= limit || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (!lines.length) return [];
    /* Ostatnia linia: dokładnie do limitu, bez urwanego słowa w połowie. */
    if (lines.length === maxLines) {
      var rest = lines[maxLines - 1];
      if (rest.length > limit) lines[maxLines - 1] = rest.slice(0, Math.max(1, limit - 1)).trim() + '…';
      else if (words.join(' ').length > lines.join(' ').length + 2) lines[maxLines - 1] = rest.replace(/[,;:.!?]?$/, '') + '…';
    }
    return lines;
  }

  function fitTitle(name, wide) {
    var length = String(name || '').length;
    var sizes = wide ? [27, 24, 21, 18, 15] : [23, 20, 17, 15, 13];
    var limit = wide ? [12, 15, 19, 24, 30] : [9, 12, 15, 19, 24];
    for (var i = 0; i < limit.length; i += 1) {
      if (length <= limit[i]) return sizes[i];
    }
    return sizes[sizes.length - 1];
  }

  /* ---------- motywy ---------- */

  function motifWindow() {
    return (
      '<rect x="-58" y="-42" width="116" height="84" rx="13" fill="#ffffff" fill-opacity=".07" stroke="#ffffff" stroke-opacity=".16"/>' +
      '<circle cx="-44" cy="-27" r="3" fill="#ffffff" fill-opacity=".38"/>' +
      '<circle cx="-34" cy="-27" r="3" fill="#ffffff" fill-opacity=".22"/>' +
      '<circle cx="-24" cy="-27" r="3" fill="#ffffff" fill-opacity=".14"/>' +
      '<rect x="-44" y="-11" width="56" height="6" rx="3" fill="#ffffff" fill-opacity=".3"/>' +
      '<rect x="-44" y="2" width="82" height="6" rx="3" fill="#ffffff" fill-opacity=".16"/>' +
      '<rect x="-44" y="15" width="44" height="6" rx="3" fill="url(#accentGrad)"/>' +
      '<rect x="14" y="15" width="24" height="6" rx="3" fill="#ffffff" fill-opacity=".12"/>'
    );
  }

  function motifCube() {
    return (
      '<polygon points="0,-48 44,-24 0,0 -44,-24" fill="#ffffff" fill-opacity=".22"/>' +
      '<polygon points="-44,-24 0,0 0,50 -44,26" fill="url(#accentGrad)" fill-opacity=".82"/>' +
      '<polygon points="44,-24 0,0 0,50 44,26" fill="url(#deepGrad)" fill-opacity=".92"/>' +
      '<path d="M-44,-24 0,0 44,-24M0,0v50" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.2"/>' +
      '<path d="M-24,-12 0,0 24,-12" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="1.2"/>'
    );
  }

  function motifChat() {
    return (
      '<rect x="-54" y="-40" width="68" height="47" rx="15" fill="url(#accentGrad)"/>' +
      '<path d="M-40 7v16l15-13z" fill="url(#accentGrad)"/>' +
      '<circle cx="-34" cy="-17" r="3.4" fill="#ffffff" fill-opacity=".85"/>' +
      '<circle cx="-21" cy="-17" r="3.4" fill="#ffffff" fill-opacity=".62"/>' +
      '<circle cx="-8" cy="-17" r="3.4" fill="#ffffff" fill-opacity=".4"/>' +
      '<rect x="-2" y="-4" width="60" height="42" rx="14" fill="#ffffff" fill-opacity=".1" stroke="#ffffff" stroke-opacity=".2"/>' +
      '<rect x="10" y="8" width="34" height="5" rx="2.5" fill="#ffffff" fill-opacity=".28"/>' +
      '<rect x="10" y="19" width="22" height="5" rx="2.5" fill="#ffffff" fill-opacity=".16"/>'
    );
  }

  function motifPlay() {
    return (
      '<circle r="46" fill="url(#coreGrad)" fill-opacity=".5"/>' +
      '<circle r="46" fill="none" stroke="url(#accentGrad)" stroke-width="1.6" stroke-opacity=".7"/>' +
      '<path d="M-11 -17 21 0 -11 17Z" fill="#ffffff" fill-opacity=".92"/>' +
      '<rect x="-64" y="16" width="4" height="18" rx="2" fill="#ffffff" fill-opacity=".22"/>' +
      '<rect x="-74" y="6" width="4" height="28" rx="2" fill="#ffffff" fill-opacity=".16"/>' +
      '<rect x="62" y="10" width="4" height="24" rx="2" fill="#ffffff" fill-opacity=".16"/>' +
      '<rect x="72" y="18" width="4" height="16" rx="2" fill="#ffffff" fill-opacity=".22"/>'
    );
  }

  function motifSearch() {
    return (
      '<circle cx="-10" cy="-10" r="32" fill="url(#coreGrad)" fill-opacity=".55"/>' +
      '<circle cx="-10" cy="-10" r="32" fill="none" stroke="url(#accentGrad)" stroke-width="7"/>' +
      '<path d="M13 13 42 42" stroke="#ffffff" stroke-opacity=".85" stroke-width="8" stroke-linecap="round"/>' +
      '<circle cx="-10" cy="-10" r="12" fill="#ffffff" fill-opacity=".12"/>'
    );
  }

  function motifLearn() {
    return (
      '<g transform="rotate(-9)">' +
      '<rect x="-56" y="-26" width="98" height="62" rx="12" fill="#ffffff" fill-opacity=".06"/>' +
      '<rect x="-48" y="-34" width="98" height="62" rx="12" fill="url(#deepGrad)" fill-opacity=".55"/>' +
      '<rect x="-40" y="-42" width="98" height="62" rx="12" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".22"/>' +
      '<rect x="-26" y="-26" width="52" height="5" rx="2.5" fill="#ffffff" fill-opacity=".4"/>' +
      '<rect x="-26" y="-14" width="70" height="5" rx="2.5" fill="#ffffff" fill-opacity=".2"/>' +
      '<rect x="-26" y="-2" width="38" height="5" rx="2.5" fill="url(#accentGrad)"/>' +
      '</g>'
    );
  }

  function motifOrbit() {
    return (
      '<ellipse rx="62" ry="24" fill="none" stroke="url(#accentGrad)" stroke-width="1.6" stroke-opacity=".65" transform="rotate(-24)"/>' +
      '<ellipse rx="62" ry="24" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="1.2" transform="rotate(40)"/>' +
      '<circle r="21" fill="url(#coreGrad)"/>' +
      '<circle cx="54" cy="-16" r="5" fill="#ffffff" fill-opacity=".9"/>' +
      '<circle cx="-42" cy="30" r="3.4" fill="#ffffff" fill-opacity=".5"/>'
    );
  }

  function motifFile() {
    return (
      '<path d="M-34-48h46l22 22v74h-68z" fill="url(#accentGrad)" fill-opacity=".5"/>' +
      '<path d="M12-48v22h22" fill="#ffffff" fill-opacity=".22"/>' +
      '<path d="M-34-48h46l22 22v74h-68z" fill="none" stroke="#ffffff" stroke-opacity=".24"/>' +
      '<rect x="-20" y="-4" width="42" height="5" rx="2.5" fill="#ffffff" fill-opacity=".4"/>' +
      '<rect x="-20" y="8" width="30" height="5" rx="2.5" fill="#ffffff" fill-opacity=".22"/>' +
      '<rect x="-20" y="20" width="36" height="5" rx="2.5" fill="#ffffff" fill-opacity=".16"/>'
    );
  }

  var MOTIFS = {
    window: motifWindow,
    cube: motifCube,
    chat: motifChat,
    play: motifPlay,
    search: motifSearch,
    learn: motifLearn,
    orbit: motifOrbit,
    file: motifFile
  };

  /* ---------- kompozycja ---------- */

  /* Szerokość tekstu „na oko”, ale z zapasem: litery mają własne odstępy
     (letter-spacing), a fonty systemowe bywają szersze niż Inter. Bez tego
     zapasu drugi napis w stopce nachodził na pierwszy. */
  function textWidth(value, size, letterSpacing) {
    return String(value || '').length * (size * 0.64 + (letterSpacing || 0));
  }

  function definitions(id, hue) {
    return (
      '<defs>' +
      '<linearGradient id="bg' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0a1424"/>' +
      '<stop offset=".58" stop-color="#070d18"/>' +
      '<stop offset="1" stop-color="#04070c"/>' +
      '</linearGradient>' +
      '<radialGradient id="glowA' + id + '" cx=".16" cy=".02" r=".85">' +
      '<stop offset="0" stop-color="' + hsl(hue, 88, 64, 0.55) + '"/>' +
      '<stop offset=".55" stop-color="' + hsl(hue, 88, 58, 0.16) + '"/>' +
      '<stop offset="1" stop-color="' + hsl(hue, 88, 58, 0) + '"/>' +
      '</radialGradient>' +
      '<radialGradient id="glowB' + id + '" cx=".97" cy="1" r=".8">' +
      '<stop offset="0" stop-color="' + hsl(hue + 44, 84, 60, 0.4) + '"/>' +
      '<stop offset="1" stop-color="' + hsl(hue + 44, 84, 60, 0) + '"/>' +
      '</radialGradient>' +
      '<linearGradient id="scrim' + id + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#04070d" stop-opacity=".82"/>' +
      '<stop offset=".52" stop-color="#04070d" stop-opacity=".42"/>' +
      '<stop offset="1" stop-color="#04070d" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<linearGradient id="scrimV' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#04070d" stop-opacity="0"/>' +
      '<stop offset=".42" stop-color="#04070d" stop-opacity="0"/>' +
      '<stop offset=".72" stop-color="#04070d" stop-opacity=".72"/>' +
      '<stop offset="1" stop-color="#04070d" stop-opacity=".9"/>' +
      '</linearGradient>' +
      '<linearGradient id="accentGrad' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + hsl(hue, 96, 76) + '"/>' +
      '<stop offset="1" stop-color="' + hsl(hue + 28, 86, 58) + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="deepGrad' + id + '" x1="1" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + hsl(hue + 14, 76, 48, 0.92) + '"/>' +
      '<stop offset="1" stop-color="' + hsl(hue - 12, 72, 28, 0.88) + '"/>' +
      '</linearGradient>' +
      '<radialGradient id="coreGrad' + id + '" cx=".5" cy=".4" r=".62">' +
      '<stop offset="0" stop-color="' + hsl(hue, 94, 78, 0.9) + '"/>' +
      '<stop offset="1" stop-color="' + hsl(hue + 22, 86, 48, 0.1) + '"/>' +
      '</radialGradient>' +
      '<pattern id="grid' + id + '" width="26" height="26" patternUnits="userSpaceOnUse">' +
      '<path d="M26 0H0v26" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="1"/>' +
      '</pattern>' +
      '<pattern id="dots' + id + '" width="13" height="13" patternUnits="userSpaceOnUse">' +
      '<circle cx="1.6" cy="1.6" r="1.05" fill="#ffffff" fill-opacity=".055"/>' +
      '</pattern>' +
      '</defs>'
    );
  }

  /* Motywy używają nazw gradientów bez sufiksu — podmieniamy je na unikalne,
     żeby dwa plakaty na jednej stronie nie dzieliły jednego gradientu. */
  function scopeMotif(markup, id) {
    return markup.replace(/url\(#(accentGrad|deepGrad|coreGrad)\)/g, 'url(#$1' + id + ')');
  }

  /* Etykieta kategorii (+ język) w pigułce — szerokość liczona z zapasem,
     więc na żadnym foncie nie wychodzi poza własne tło. */
  function categoryPill(cat, project, x, y, id) {
    var language = String(project.language || '').trim().toUpperCase();
    var label = String(cat.label || 'PROJEKT').toUpperCase();
    var value = language ? label + '  ·  ' + language : label;
    var size = 8.6;
    var tracking = 1.7;
    var width = 9 + textWidth(value, size, tracking) + 9;
    return (
      '<rect x="' + x + '" y="' + y + '" width="' + width.toFixed(1) + '" height="20" rx="10" ' +
      'fill="#ffffff" fill-opacity=".07" stroke="#ffffff" stroke-opacity=".16"/>' +
      '<text x="' + (x + 9) + '" y="' + (y + 13.6) + '" fill="url(#accentGrad' + id + ')" ' +
      'font-family="\'Inter\',system-ui,sans-serif" font-size="' + size + '" font-weight="700" ' +
      'letter-spacing="' + tracking + '">' + escapeXml(value) + '</text>'
    );
  }

  function buildLandscape(project, id, cat) {
    var name = String(project.name || '');
    var size = name.length <= 10 ? 31 : name.length <= 14 ? 27 : name.length <= 19 ? 23 : name.length <= 26 ? 19 : 16;
    var nameLines = wrap(name, size >= 24 ? 16 : size >= 20 ? 20 : 26, 2);
    var descLines = wrap(project.description, 48, 2);
    var titleTop = 112;
    var titleBottom = titleTop + (nameLines.length - 1) * (size + 3);
    var descTop = titleBottom + 27;
    var domain = String(project.domain || '').replace(/^www\./, '');

    var title = '';
    nameLines.forEach(function (line, i) {
      title +=
        '<text x="26" y="' + (titleTop + i * (size + 3)) + '" fill="#f4f8ff" ' +
        'font-family="\'Space Grotesk\',\'Inter\',system-ui,sans-serif" font-size="' + size + '" ' +
        'font-weight="700" letter-spacing="-.6">' + escapeXml(line) + '</text>';
    });

    var desc = '';
    descLines.forEach(function (line, i) {
      desc +=
        '<text x="26" y="' + (descTop + i * 15) + '" fill="#d3e0f4" fill-opacity=".68" ' +
        'font-family="\'Inter\',system-ui,sans-serif" font-size="10.4" letter-spacing=".12">' +
        escapeXml(line) + '</text>';
    });

    var footer = '';
    if (domain) {
      footer =
        '<circle cx="29" cy="234" r="2.6" fill="url(#accentGrad' + id + ')"/>' +
        '<text x="38" y="237.4" fill="#cfdcf2" fill-opacity=".62" ' +
        'font-family="\'Inter\',system-ui,sans-serif" font-size="9.4" letter-spacing=".2">' +
        escapeXml(domain) + '</text>';
    }

    return (
      '<svg xmlns="' + SVG_NS + '" class="card-preview-poster" viewBox="0 0 480 270" ' +
      'preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" role="presentation">' +
      definitions(id, cat.hue) +
      '<rect width="480" height="270" fill="url(#bg' + id + ')"/>' +
      '<rect width="480" height="270" fill="url(#glowA' + id + ')"/>' +
      '<rect width="480" height="270" fill="url(#glowB' + id + ')"/>' +
      '<rect width="480" height="270" fill="url(#dots' + id + ')"/>' +
      '<rect width="480" height="270" fill="url(#grid' + id + ')"/>' +
      '<g transform="translate(384 138) scale(.98)">' + scopeMotif(MOTIFS[cat.motif](), id) + '</g>' +
      '<rect width="330" height="270" fill="url(#scrim' + id + ')"/>' +
      categoryPill(cat, project, 26, 20, id) +
      title + desc +
      '<path d="M26 213h428" stroke="#ffffff" stroke-opacity=".09"/>' +
      footer +
      '<text x="454" y="237.4" text-anchor="end" fill="url(#accentGrad' + id + ')" ' +
      'font-family="\'Inter\',system-ui,sans-serif" font-size="10" font-weight="700" letter-spacing=".2">' +
      'otwórz ↗</text>' +
      '<rect x=".5" y=".5" width="479" height="269" rx="1" fill="none" stroke="#ffffff" stroke-opacity=".08"/>' +
      '</svg>'
    );
  }

  function buildPortrait(project, id, cat) {
    /* Kadr pionowy trafia wyłącznie do wąskiej karty na telefonie (ok. 90–190 px
       szerokości). Dlatego nie ma tu opisu ani adresu — przy takim rozmiarze
       byłyby tylko szumem. Zostaje duży motyw, nazwa i strzałka. */
    var name = String(project.name || '');
    var size = name.length <= 8 ? 34 : name.length <= 12 ? 29 : name.length <= 17 ? 24 : name.length <= 23 ? 20 : 17;
    var nameLines = wrap(name, size >= 29 ? 9 : size >= 24 ? 12 : size >= 20 ? 15 : 19, 2);
    var titleTop = 356 - (nameLines.length - 1) * (size + 2);

    var title = '';
    nameLines.forEach(function (line, i) {
      title +=
        '<text x="150" y="' + (titleTop + i * (size + 2)) + '" text-anchor="middle" fill="#f4f8ff" ' +
        'font-family="\'Space Grotesk\',\'Inter\',system-ui,sans-serif" font-size="' + size + '" ' +
        'font-weight="700" letter-spacing="-.6">' + escapeXml(line) + '</text>';
    });

    return (
      '<svg xmlns="' + SVG_NS + '" class="card-preview-poster" viewBox="0 0 300 500" ' +
      'preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" role="presentation">' +
      definitions(id, cat.hue) +
      '<rect width="300" height="500" fill="url(#bg' + id + ')"/>' +
      '<rect width="300" height="500" fill="url(#glowA' + id + ')"/>' +
      '<rect width="300" height="500" fill="url(#glowB' + id + ')"/>' +
      '<rect width="300" height="500" fill="url(#dots' + id + ')"/>' +
      '<rect width="300" height="500" fill="url(#grid' + id + ')"/>' +
      '<g transform="translate(150 210) scale(1.36)">' + scopeMotif(MOTIFS[cat.motif](), id) + '</g>' +
      '<rect width="300" height="500" fill="url(#scrimV' + id + ')"/>' +
      title +
      '<text x="150" y="' + (titleTop + nameLines.length * (size + 2) + 12) + '" text-anchor="middle" ' +
      'fill="url(#accentGrad' + id + ')" font-family="\'Inter\',system-ui,sans-serif" ' +
      'font-size="13" font-weight="700" letter-spacing=".2">otwórz ↗</text>' +
      '<rect x=".5" y=".5" width="299" height="499" rx="1" fill="none" stroke="#ffffff" stroke-opacity=".08"/>' +
      '</svg>'
    );
  }

  function build(project, options) {
    var data = project || {};
    var cat = category(data);
    uid += 1;
    var id = String(uid);
    return (options && options.variant === 'port' ? buildPortrait : buildLandscape)(data, id, cat);
  }

  /* ---------- osadzanie w karcie ---------- */

  function shouldBePortrait() {
    try {
      return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    } catch (error) {
      return false;
    }
  }

  function decorate(preview) {
    if (!preview || preview._rjPoster) return;
    var frame = preview.querySelector('.card-preview-frame');
    if (!frame) return;
    var card = preview.closest('.project-card') || preview.parentNode;
    if (!card) return;

    var project = fromCard(card);
    if (!project.name && !project.description) return;

    var holder = document.createElement('div');
    holder.innerHTML = build(project, { variant: shouldBePortrait() ? 'port' : 'land' });
    var svg = holder.firstElementChild;
    if (!svg) return;

    frame.insertBefore(svg, frame.firstChild);
    preview._rjPoster = svg;
    preview.classList.add('has-poster');
    preview.setAttribute('data-poster', shouldBePortrait() ? 'port' : 'land');
  }

  function attach(root) {
    var scope = root || document;
    var list = scope.querySelectorAll ? scope.querySelectorAll('.card-preview') : [];
    list.forEach(decorate);
    return list.length;
  }

  /* Zmiana szerokości przez próg telefonu: plakat ma inny układ (pionowy kadr),
     więc przerysowujemy go raz, po ustabilizowaniu rozmiaru. */
  var resizeTimer = 0;
  function refresh() {
    var variant = shouldBePortrait() ? 'port' : 'land';
    document.querySelectorAll('.card-preview').forEach(function (preview) {
      if (!preview._rjPoster) { decorate(preview); return; }
      if (preview.getAttribute('data-poster') === variant) return;
      while (preview._rjPoster && preview._rjPoster.parentNode) {
        preview._rjPoster.parentNode.removeChild(preview._rjPoster);
      }
      preview._rjPoster = null;
      decorate(preview);
    });
  }

  function scheduleRefresh() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 250);
  }

  /* Karty są renderowane przez js/app.js i podmieniane przy synchronizacji
     z GitHubem — plakat musi wracać także po każdej takiej zmianie. */
  function watch() {
    attach(document);

    if (typeof MutationObserver === 'function') {
      var pending = 0;
      var observer = new MutationObserver(function () {
        clearTimeout(pending);
        pending = setTimeout(function () { attach(document); }, 180);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    try {
      if (window.matchMedia) {
        var query = window.matchMedia('(max-width: 640px)');
        if (query.addEventListener) query.addEventListener('change', scheduleRefresh);
        else if (query.addListener) query.addListener(scheduleRefresh);
      }
    } catch (error) { /* starsze przeglądarki — tylko start */ }

    window.addEventListener('resize', scheduleRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduleRefresh, { passive: true });
  }

  window.RJPosters = {
    build: build,
    decorate: decorate,
    attach: attach,
    refresh: refresh,
    data: fromCard
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }
})();
