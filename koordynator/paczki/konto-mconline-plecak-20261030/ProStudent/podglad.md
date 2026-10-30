# Podgląd zmian: ProStudent

Wyłącznie do czytania; pełne pliki i ich sumy są w planie.

```diff
--- a/README.md
+++ b/README.md
@@ -158,3 +158,9 @@
 Na `https://rejson59.github.io` dokument rozpoznaje jednorazowy znacznik przejścia i wczytuje animację wyjścia przed startem aplikacji — również wtedy, gdy projekt ma własny service worker. Bez znacznika, w ramce, na innych domenach i przy niedostępnej pamięci sesji kod nie pobiera zasobów portalu. Skrypt nie przenosi kont ani danych między domenami; na innych originach wyjście z portalu nie jest gwarantowane.

 Plecak zachowuje własny tryb offline; jego service worker czyści tylko stare cache o prefiksie `plecak-` i przechwytuje POST wyłącznie dla zadeklarowanego w manifeście udostępniania. Nie usuwa cache innych projektów.
+
+## Wspólne konto Rejson
+
+Przycisk „Konto Rejson” pozwala zalogować się lub utworzyć konto bez opuszczania Plecaka. To opcjonalne konto korzysta z tego samego backendu co strona główna i RejChat, z hasłem albo dotychczasowym PIN-em. Na tym samym originie projekty używają wspólnej sesji; na innej domenie trzeba zalogować się osobno. PIN można zamienić na hasło na stronie konta Rejsona. Bez e-maila automatyczne odzyskiwanie zapomnianego hasła nie jest dostępne.
+
+**Konto nie synchronizuje jeszcze danych szkolnych.** Oceny, plan, zadania i inne dane pozostają lokalnie. Żadne dane Plecaka nie są wysyłane do konta przy logowaniu i nie są wtedy zastępowane ani usuwane. Do przenoszenia służy dotychczasowa kopia plikowa w panelu „Twoje dane”; import po potwierdzeniu zastępuje lokalne dane Plecaka. Plecak nadal działa bez konta i bez sieci; weryfikacja konta wymaga połączenia. Wylogowanie usuwa lokalną sesję, ale nie unieważnia jej po stronie serwera.
--- a/package-lock.json
+++ b/package-lock.json
@@ -19,6 +19,7 @@
         "@types/react": "19.2.7",
         "@types/react-dom": "19.2.3",
         "@vitejs/plugin-react": "5.1.1",
+        "jsdom": "^26.1.0",
         "tailwindcss": "4.1.17",
         "typescript": "5.9.3",
         "vite": "7.3.7",
@@ -28,6 +29,27 @@
       "engines": {
         "node": ">=20.19"
       }
+    },
+    "node_modules/@asamuzakjp/css-color": {
+      "version": "3.2.0",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/css-color/-/css-color-3.2.0.tgz",
+      "integrity": "sha512-K1A6z8tS3XsmCMM86xoWdn7Fkdn9m6RSVtocUrJYIwZnFVkng/PvkEoWtOWmP+Scc6saYWHWZYbndEEXxl24jw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@csstools/css-calc": "^2.1.3",
+        "@csstools/css-color-parser": "^3.0.9",
+        "@csstools/css-parser-algorithms": "^3.0.4",
+        "@csstools/css-tokenizer": "^3.0.3",
+        "lru-cache": "^10.4.3"
+      }
+    },
+    "node_modules/@asamuzakjp/css-color/node_modules/lru-cache": {
+      "version": "10.4.3",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-10.4.3.tgz",
+      "integrity": "sha512-JNAzZcXrCt42VGLuYz0zfAzDfAvJWW6AfYlDBQyDV5DClI2m5sAmK+OIO7s59XfsRsWHp02jAJrRadPRGTt6SQ==",
+      "dev": true,
+      "license": "ISC"
     },
     "node_modules/@babel/code-frame": {
       "version": "7.29.7",
@@ -311,6 +333,121 @@
         "node": ">=6.9.0"
       }
     },
+    "node_modules/@csstools/color-helpers": {
+      "version": "5.1.0",
+      "resolved": "https://registry.npmjs.org/@csstools/color-helpers/-/color-helpers-5.1.0.tgz",
+      "integrity": "sha512-S11EXWJyy0Mz5SYvRmY8nJYTFFd1LCNV+7cXyAgQtOOuzb4EsgfqDufL+9esx72/eLhsRdGZwaldu/h+E4t4BA==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT-0",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@csstools/css-calc": {
+      "version": "2.1.4",
+      "resolved": "https://registry.npmjs.org/@csstools/css-calc/-/css-calc-2.1.4.tgz",
+      "integrity": "sha512-3N8oaj+0juUw/1H3YwmDDJXCgTB1gKU6Hc/bB502u9zR0q2vd786XJH9QfrKIEgFlZmhZiq6epXl4rHqhzsIgQ==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^3.0.5",
+        "@csstools/css-tokenizer": "^3.0.4"
+      }
+    },
+    "node_modules/@csstools/css-color-parser": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/@csstools/css-color-parser/-/css-color-parser-3.1.0.tgz",
+      "integrity": "sha512-nbtKwh3a6xNVIp/VRuXV64yTKnb1IjTAEEh3irzS+HkKjAOYLTGNb9pmVNntZ8iVBHcWDA2Dof0QtPgFI1BaTA==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@csstools/color-helpers": "^5.1.0",
+        "@csstools/css-calc": "^2.1.4"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^3.0.5",
+        "@csstools/css-tokenizer": "^3.0.4"
+      }
+    },
+    "node_modules/@csstools/css-parser-algorithms": {
+      "version": "3.0.5",
+      "resolved": "https://registry.npmjs.org/@csstools/css-parser-algorithms/-/css-parser-algorithms-3.0.5.tgz",
+      "integrity": "sha512-DaDeUkXZKjdGhgYaHNJTV9pV7Y9B3b644jCLs9Upc3VeNGg6LWARAT6O+Q+/COo+2gg/bM5rhpMAtf70WqfBdQ==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@csstools/css-tokenizer": "^3.0.4"
+      }
+    },
+    "node_modules/@csstools/css-tokenizer": {
+      "version": "3.0.4",
+      "resolved": "https://registry.npmjs.org/@csstools/css-tokenizer/-/css-tokenizer-3.0.4.tgz",
+      "integrity": "sha512-Vd/9EVDiu6PPJt9yAh6roZP6El1xHrdvIVGjyBsHR0RYwNHgL7FJPyIIW4fANJNG6FtyZfvlRPpFI4ZM/lubvw==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/@esbuild/aix-ppc64": {
       "version": "0.27.7",
       "resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.7.tgz",
@@ -1685,6 +1822,16 @@
         "url": "https://opencollective.com/vitest"
       }
     },
+    "node_modules/agent-base": {
+      "version": "7.1.4",
+      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz",
+      "integrity": "sha512-MnA+YT8fwfJPgBx3m60MNqakm30XOkyIoH1y6huTQvC0PwZG7ki8NacLBcrPbNoo8vEZy7Jpuk7+jMO+CUovTQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">= 14"
+      }
+    },
     "node_modules/assertion-error": {
       "version": "2.0.1",
       "resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz",
@@ -1829,6 +1976,20 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/cssstyle": {
+      "version": "4.6.0",
+      "resolved": "https://registry.npmjs.org/cssstyle/-/cssstyle-4.6.0.tgz",
+      "integrity": "sha512-2z+rWdzbbSZv6/rhtvzvqeZQHrBaqgogqt85sqFNbabZOuFbCVFb8kPeEtZjiKkbrm395irpNKiYeFeLiQnFPg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@asamuzakjp/css-color": "^3.2.0",
+        "rrweb-cssom": "^0.8.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/csstype": {
       "version": "3.2.3",
       "resolved": "https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz",
@@ -1836,6 +1997,20 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/data-urls": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/data-urls/-/data-urls-5.0.0.tgz",
+      "integrity": "sha512-ZYP5VBHshaDAiVZxjbRVcFJpc+4xGgT0bK3vzy1HLN8jTO975HEbuYzZJcHoQEY5K1a0z8YayJkyVETa08eNTg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "whatwg-mimetype": "^4.0.0",
+        "whatwg-url": "^14.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/debug": {
       "version": "4.4.3",
       "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
@@ -1854,6 +2029,13 @@
         }
       }
     },
+    "node_modules/decimal.js": {
+      "version": "10.6.0",
+      "resolved": "https://registry.npmjs.org/decimal.js/-/decimal.js-10.6.0.tgz",
+      "integrity": "sha512-YpgQiITW3JXGntzdUmyUR1V812Hn8T1YVXhCu+wO3OpS4eU9l4YdD3qjyiKdV6mvV29zapkMeD390UVEf2lkUg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/deep-eql": {
       "version": "5.0.2",
       "resolved": "https://registry.npmjs.org/deep-eql/-/deep-eql-5.0.2.tgz",
@@ -1893,6 +2075,19 @@
       },
       "engines": {
         "node": ">=10.13.0"
+      }
+    },
+    "node_modules/entities": {
+      "version": "6.0.1",
+      "resolved": "https://registry.npmjs.org/entities/-/entities-6.0.1.tgz",
+      "integrity": "sha512-aN97NXWF6AWBTahfVOIrB/NShkzi5H7F9r1s9mD3cDj4Ko5f2qhhVoYMibXF7GlLveb/D2ioWay8lxI97Ven3g==",
+      "dev": true,
+      "license": "BSD-2-Clause",
+      "engines": {
+        "node": ">=0.12"
+      },
+      "funding": {
+        "url": "https://github.com/fb55/entities?sponsor=1"
       }
     },
     "node_modules/es-module-lexer": {
@@ -2037,6 +2232,60 @@
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/html-encoding-sniffer": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/html-encoding-sniffer/-/html-encoding-sniffer-4.0.0.tgz",
+      "integrity": "sha512-Y22oTqIU4uuPgEemfz7NDJz6OeKf12Lsu+QC+s3BVpda64lTiMYCyGwg5ki4vFxkMwQdeZDl2adZoqUgdFuTgQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "whatwg-encoding": "^3.1.1"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/http-proxy-agent": {
+      "version": "7.0.2",
+      "resolved": "https://registry.npmjs.org/http-proxy-agent/-/http-proxy-agent-7.0.2.tgz",
+      "integrity": "sha512-T1gkAiYYDWYx3V5Bmyu7HcfcvL7mUrTWiM6yOfa3PIphViJ/gFPbvidQ+veqSOHci/PxBcDabeUNCzpOODJZig==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "agent-base": "^7.1.0",
+        "debug": "^4.3.4"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/https-proxy-agent": {
+      "version": "7.0.6",
+      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz",
+      "integrity": "sha512-vK9P5/iUfdl95AI+JVyUuIcVtd4ofvtrOr3HNtM2yxC9bnMbEdp3x01OhQNnjb8IJYi38VlTE3mBXwcfvywuSw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "agent-base": "^7.1.2",
+        "debug": "4"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/iconv-lite": {
+      "version": "0.6.3",
+      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.6.3.tgz",
+      "integrity": "sha512-4fCk79wshMdzMp2rH06qWrJE4iolqLhCUH+OiuIgU++RB0+94NlDL81atO7GX55uUKueo0txHNtvEyI6D7WdMw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "safer-buffer": ">= 2.1.2 < 3.0.0"
+      },
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/is-number": {
       "version": "7.0.0",
       "resolved": "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
@@ -2047,6 +2296,13 @@
         "node": ">=0.12.0"
       }
     },
+    "node_modules/is-potential-custom-element-name": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/is-potential-custom-element-name/-/is-potential-custom-element-name-1.0.1.tgz",
+      "integrity": "sha512-bCYeRA2rVibKZd+s2625gGnGF/t7DSqDs4dP7CrLA1m7jKWz6pps0LpYLJN8Q64HtmPKJ1hrN3nzPNKFEKOUiQ==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/jiti": {
       "version": "2.7.0",
       "resolved": "https://registry.npmjs.org/jiti/-/jiti-2.7.0.tgz",
@@ -2063,6 +2319,46 @@
       "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
       "dev": true,
       "license": "MIT"
+    },
+    "node_modules/jsdom": {
+      "version": "26.1.0",
+      "resolved": "https://registry.npmjs.org/jsdom/-/jsdom-26.1.0.tgz",
+      "integrity": "sha512-Cvc9WUhxSMEo4McES3P7oK3QaXldCfNWp7pl2NNeiIFlCoLr3kfq9kb1fxftiwk1FLV7CvpvDfonxtzUDeSOPg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "cssstyle": "^4.2.1",
+        "data-urls": "^5.0.0",
+        "decimal.js": "^10.5.0",
+        "html-encoding-sniffer": "^4.0.0",
+        "http-proxy-agent": "^7.0.2",
+        "https-proxy-agent": "^7.0.6",
+        "is-potential-custom-element-name": "^1.0.1",
+        "nwsapi": "^2.2.16",
+        "parse5": "^7.2.1",
+        "rrweb-cssom": "^0.8.0",
+        "saxes": "^6.0.0",
+        "symbol-tree": "^3.2.4",
+        "tough-cookie": "^5.1.1",
+        "w3c-xmlserializer": "^5.0.0",
+        "webidl-conversions": "^7.0.0",
+        "whatwg-encoding": "^3.1.1",
+        "whatwg-mimetype": "^4.0.0",
+        "whatwg-url": "^14.1.1",
+        "ws": "^8.18.0",
+        "xml-name-validator": "^5.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "canvas": "^3.0.0"
+      },
+      "peerDependenciesMeta": {
+        "canvas": {
+          "optional": true
+        }
+      }
     },
     "node_modules/jsesc": {
       "version": "3.1.0",
@@ -2439,6 +2735,26 @@
       "license": "MIT",
       "engines": {
         "node": ">=18"
+      }
+    },
+    "node_modules/nwsapi": {
+      "version": "2.2.28",
+      "resolved": "https://registry.npmjs.org/nwsapi/-/nwsapi-2.2.28.tgz",
+      "integrity": "sha512-IlVB7OS7qrOsVYlpnFIkETjMwT9jwvmocJmmM+GZU/PAB3uGi9Ezd7vcWhWBUnSc0ya4ppmQITOyP1ez9gg8cg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/parse5": {
+      "version": "7.3.0",
+      "resolved": "https://registry.npmjs.org/parse5/-/parse5-7.3.0.tgz",
+      "integrity": "sha512-IInvU7fabl34qmi9gY8XOVxhYyMyuH2xUNpb2q8/Y+7552KlejkRvqvD19nMoUW/uQGGbqNpA6Tufu5FL5BZgw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "entities": "^6.0.0"
+      },
+      "funding": {
+        "url": "https://github.com/inikulin/parse5?sponsor=1"
       }
     },
     "node_modules/pathe": {
@@ -2505,6 +2821,16 @@
       },
       "engines": {
         "node": "^10 || ^12 || >=14"
+      }
+    },
+    "node_modules/punycode": {
+      "version": "2.3.1",
+      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
+      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=6"
       }
     },
     "node_modules/react": {
@@ -2584,6 +2910,33 @@
         "fsevents": "~2.3.2"
       }
     },
+    "node_modules/rrweb-cssom": {
+      "version": "0.8.0",
+      "resolved": "https://registry.npmjs.org/rrweb-cssom/-/rrweb-cssom-0.8.0.tgz",
+      "integrity": "sha512-guoltQEx+9aMf2gDZ0s62EcV8lsXR+0w8915TC3ITdn2YueuNjdAYh/levpU9nFaoChh9RUS5ZdQMrKfVEN9tw==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/safer-buffer": {
+      "version": "2.1.2",
+      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
+      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/saxes": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/saxes/-/saxes-6.0.0.tgz",
+      "integrity": "sha512-xAg7SOnEhrm5zI3puOOKyy1OMcMlIJZYNJY7xLBwSze0UjhPLnWfj2GF2EpT0jmzaJKIWKHLsaSSajf35bcYnA==",
+      "dev": true,
+      "license": "ISC",
+      "dependencies": {
+        "xmlchars": "^2.2.0"
+      },
+      "engines": {
+        "node": ">=v12.22.7"
+      }
+    },
     "node_modules/scheduler": {
       "version": "0.27.0",
       "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
@@ -2651,6 +3004,13 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/symbol-tree": {
+      "version": "3.2.4",
+      "resolved": "https://registry.npmjs.org/symbol-tree/-/symbol-tree-3.2.4.tgz",
+      "integrity": "sha512-9QNk5KwDF+Bvz+PyObkmSYjI5ksVUYtjW7AU22r2NKcfLJcXp96hkDWU3+XndOsUb+AQ9QhfzfCT2O+CNWT5Tw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/tailwind-merge": {
       "version": "3.4.0",
       "resolved": "https://registry.npmjs.org/tailwind-merge/-/tailwind-merge-3.4.0.tgz",
@@ -2743,6 +3103,26 @@
         "node": ">=14.0.0"
       }
     },
+    "node_modules/tldts": {
+      "version": "6.1.86",
+      "resolved": "https://registry.npmjs.org/tldts/-/tldts-6.1.86.tgz",
+      "integrity": "sha512-WMi/OQ2axVTf/ykqCQgXiIct+mSQDFdH2fkwhPwgEwvJ1kSzZRiinb0zF2Xb8u4+OqPChmyI6MEu4EezNJz+FQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tldts-core": "^6.1.86"
+      },
+      "bin": {
+        "tldts": "bin/cli.js"
+      }
+    },
+    "node_modules/tldts-core": {
+      "version": "6.1.86",
+      "resolved": "https://registry.npmjs.org/tldts-core/-/tldts-core-6.1.86.tgz",
+      "integrity": "sha512-Je6p7pkk+KMzMv2XXKmAE3McmolOQFdxkKw0R8EYNr7sELW46JqnNeTX8ybPiQgvg1ymCoF8LXs5fzFaZvJPTA==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/to-regex-range": {
       "version": "5.0.1",
       "resolved": "https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz",
@@ -2754,6 +3134,32 @@
       },
       "engines": {
         "node": ">=8.0"
+      }
+    },
+    "node_modules/tough-cookie": {
+      "version": "5.1.2",
+      "resolved": "https://registry.npmjs.org/tough-cookie/-/tough-cookie-5.1.2.tgz",
+      "integrity": "sha512-FVDYdxtnj0G6Qm/DhNPSb8Ju59ULcup3tuJxkFb5K8Bv2pUXILbf0xZWU8PX8Ov19OXljbUyveOFwRMwkXzO+A==",
+      "dev": true,
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "tldts": "^6.1.32"
+      },
+      "engines": {
+        "node": ">=16"
+      }
+    },
+    "node_modules/tr46": {
+      "version": "5.1.1",
+      "resolved": "https://registry.npmjs.org/tr46/-/tr46-5.1.1.tgz",
+      "integrity": "sha512-hdF5ZgjTqgAntKkklYw0R03MG2x/bSzTtkxmIRw/sTNV8YXsCJ1tfLAX23lhxhHJlEf3CRCOCGGWw3vI3GaSPw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "punycode": "^2.3.1"
+      },
+      "engines": {
+        "node": ">=18"
       }
     },
     "node_modules/typescript": {
@@ -2996,6 +3402,67 @@
         }
       }
     },
+    "node_modules/w3c-xmlserializer": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/w3c-xmlserializer/-/w3c-xmlserializer-5.0.0.tgz",
+      "integrity": "sha512-o8qghlI8NZHU1lLPrpi2+Uq7abh4GGPpYANlalzWxyWteJOCsr/P+oPBA49TOLu5FTZO4d3F9MnWJfiMo4BkmA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "xml-name-validator": "^5.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/webidl-conversions": {
+      "version": "7.0.0",
+      "resolved": "https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-7.0.0.tgz",
+      "integrity": "sha512-VwddBukDzu71offAQR975unBIGqfKZpM+8ZX6ySk8nYhVoo5CYaZyzt3YBvYtRtO+aoGlqxPg/B87NGVZ/fu6g==",
+      "dev": true,
+      "license": "BSD-2-Clause",
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/whatwg-encoding": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/whatwg-encoding/-/whatwg-encoding-3.1.1.tgz",
+      "integrity": "sha512-6qN4hJdMwfYBtE3YBTTHhoeuUrDBPZmbQaxWAqSALV/MeEnR5z1xd8UKud2RAkFoPkmB+hli1TZSnyi84xz1vQ==",
+      "deprecated": "Use @exodus/bytes instead for a more spec-conformant and faster implementation",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "iconv-lite": "0.6.3"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/whatwg-mimetype": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-4.0.0.tgz",
+      "integrity": "sha512-QaKxh0eNIi2mE9p2vEdzfagOKHCcj1pJ56EEHGQOVxp8r9/iszLUUV7v89x9O1p/T+NlTM5W7jW6+cz4Fq1YVg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/whatwg-url": {
+      "version": "14.2.0",
+      "resolved": "https://registry.npmjs.org/whatwg-url/-/whatwg-url-14.2.0.tgz",
+      "integrity": "sha512-De72GdQZzNTUBBChsXueQUnPKDkg/5A5zp7pFDuQAj5UFoENpiACU0wlCvzpAGnTkj++ihpKwKyYewn/XNUbKw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tr46": "^5.1.0",
+        "webidl-conversions": "^7.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
     "node_modules/why-is-node-running": {
       "version": "2.3.0",
       "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
@@ -3013,6 +3480,45 @@
         "node": ">=8"
       }
     },
+    "node_modules/ws": {
+      "version": "8.22.0",
+      "resolved": "https://registry.npmjs.org/ws/-/ws-8.22.0.tgz",
+      "integrity": "sha512-Ydggc987+RO0AnWtZ/7Wq9FtNvcrL1b/RO0ud9mWjUPgDrsAAwQSF51sm2hm1XofbU/4jkpGEsLFsZZxU+1DOg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=10.0.0"
+      },
+      "peerDependencies": {
+        "bufferutil": "^4.0.1",
+        "utf-8-validate": ">=5.0.2"
+      },
+      "peerDependenciesMeta": {
+        "bufferutil": {
+          "optional": true
+        },
+        "utf-8-validate": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/xml-name-validator": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/xml-name-validator/-/xml-name-validator-5.0.0.tgz",
+      "integrity": "sha512-EvGK8EJ3DhaHfbRlETOWAS5pO9MZITeauHKJyb8wyajUfQUenkIg2MvLDTZ4T/TgIcm3HU0TFBgWWboAZ30UHg==",
+      "dev": true,
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/xmlchars": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/xmlchars/-/xmlchars-2.2.0.tgz",
+      "integrity": "sha512-JZnDKK8B0RCDw84FNdDAIpZK+JuJw+s7Lz8nksI7SIuU3UXJJslUthsi+uWBUYOwPFwW7W7PRLRfUKpxjtjFCw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/yallist": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
--- a/package.json
+++ b/package.json
@@ -22,6 +22,7 @@
     "@types/react": "19.2.7",
     "@types/react-dom": "19.2.3",
     "@vitejs/plugin-react": "5.1.1",
+    "jsdom": "^26.1.0",
     "tailwindcss": "4.1.17",
     "typescript": "5.9.3",
     "vite": "7.3.7",
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -9,6 +9,7 @@
 import { DataPanel } from "./components/DataPanel";
 import { JournalImport } from "./components/JournalImport";
 import { Icon } from "./components/Icon";
+import CommunityAccount from "./components/CommunityAccount";
 import { useToast } from "./components/Toast";
 import { requestPersistence, useLocal, useNow } from "./lib/store";
 import { addDays, dateISO, defaultTasks, uid, type Session, type Task } from "./lib/data";
@@ -37,6 +38,8 @@
   const [freshId, setFreshId] = useState<string>();
   const [palette, setPalette] = useState(false);
   const [dataPanel, setDataPanel] = useState(false);
+  const [accountOpen, setAccountOpen] = useState(false);
+  const closeAccount = useCallback(() => setAccountOpen(false), []);
   const [journalOpen, setJournalOpen] = useState(false);
   const [pendingShare, setPendingShare] = useState<string | null>(null);
   const [incoming, setIncoming] = useState<JournalSnapshot | null>(null);
@@ -203,6 +206,7 @@

   useEffect(() => {
     const handler = (event: KeyboardEvent) => {
+      if (accountOpen) return;
       if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
         event.preventDefault();
         setPalette((prev) => !prev);
@@ -216,7 +220,7 @@
     };
     window.addEventListener("keydown", handler);
     return () => window.removeEventListener("keydown", handler);
-  }, [go, palette, dataPanel, journalOpen]);
+  }, [go, palette, dataPanel, journalOpen, accountOpen]);

   const quickAdd = useCallback(
     (title: string) => {
@@ -373,6 +377,14 @@
             <kbd className="hidden lg:inline text-[10px] border border-line rounded-md px-1.5">⌘K</kbd>
           </button>
           <button
+            onClick={() => setAccountOpen(true)}
+            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer"
+            title="Konto Rejson" aria-label="Konto Rejson"
+          >
+            <Icon name="user" className="w-4 h-4" />
+            <span className="hidden lg:inline">Konto Rejson</span>
+          </button>
+          <button
             onClick={() => setJournalOpen(true)}
             className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm text-muted hover:text-ink hover:bg-line/50 transition justify-center lg:justify-start cursor-pointer"
             title="Połącz z e-dziennikiem (eduVULCAN)"
@@ -402,7 +414,7 @@
       </aside>

       {/* Mobile top bar */}
-      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-paper/80 backdrop-blur-xl border-b border-line">
+      <header className="md:hidden sticky top-0 z-30 flex flex-wrap gap-y-1 items-center justify-between px-4 py-3 bg-paper/80 backdrop-blur-xl border-b border-line">
         <div className="flex items-center gap-2">
           <span className="text-2xl">🎒</span>
           <span className="font-display text-xl font-semibold">Plecak</span>
@@ -416,6 +428,9 @@
               {fmt(timer.remaining)}
             </button>
           )}
+          <button onClick={() => setAccountOpen(true)} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Konto Rejson" title="Konto Rejson">
+            <Icon name="user" />
+          </button>
           <button onClick={() => setPalette(true)} className="p-2 rounded-xl text-muted cursor-pointer" aria-label="Szukaj">
             <Icon name="search" />
           </button>
@@ -489,6 +504,7 @@
         ))}
       </nav>

+      {accountOpen && <CommunityAccount onClose={closeAccount} />}
       <CommandPalette open={palette} onClose={() => setPalette(false)} actions={actions} onQuickAdd={quickAdd} />
       <DataPanel open={dataPanel} onClose={() => setDataPanel(false)} onOpenJournal={() => { setDataPanel(false); setJournalOpen(true); }} />
       <JournalImport
--- /dev/null
+++ b/src/components/CommunityAccount.test.tsx
@@ -0,0 +1,59 @@
+// @vitest-environment jsdom
+import { act } from "react";
+import { createRoot } from "react-dom/client";
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+import App from "../App";
+import { COMMUNITY_SESSION_KEY } from "../lib/communityAccount";
+
+const token = "t".repeat(48);
+const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
+let container: HTMLDivElement;
+let root: ReturnType<typeof createRoot>;
+const set = (input: HTMLInputElement, value: string) => {
+  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
+  input.dispatchEvent(new Event("input", { bubbles: true }));
+};
+beforeEach(() => {
+  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
+  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
+  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("community_whoami") ? json({ username: "Rejson" }) : json({ token, username: "bad-local-name" })));
+  localStorage.clear();
+  container = document.createElement("div"); document.body.appendChild(container);
+  root = createRoot(container);
+});
+afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
+describe("konto w Plecaku", () => {
+  it("opens from the real app, logs in without changing school data and logs out", async () => {
+    localStorage.setItem("plecak:grades", '[{"subject":"Matematyka","value":5}]');
+    await act(async () => root.render(<App />));
+    const original = localStorage.getItem("plecak:grades");
+    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Konto Rejson"]')!;
+    expect(button).toBeTruthy();
+    await act(async () => button.click());
+    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="community-title"]')!;
+    expect(dialog.textContent).toMatch(/nie przenosi/);
+    const fields = dialog.querySelectorAll<HTMLInputElement>("input");
+    await act(async () => { set(fields[0], "Rejson"); set(fields[1], "1234"); });
+    await act(async () => { dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
+    expect(dialog.textContent).toContain("Zalogowano jako Rejson");
+    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).not.toContain("1234");
+    expect(localStorage.getItem("plecak:grades")).toBe(original);
+    const logout = [...dialog.querySelectorAll("button")].find((item) => item.textContent?.includes("Wyloguj na tym urządzeniu"))!;
+    await act(async () => logout.click());
+    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).toBeNull();
+    expect(localStorage.getItem("plecak:grades")).toBe(original);
+  });
+  it("does not claim authentication or erase data when the service is offline", async () => {
+    localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify({ token, username: "FakeName" }));
+    localStorage.setItem("plecak:tasks", '[{"title":"Nie usuwać"}]');
+    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
+    await act(async () => root.render(<App />));
+    const original = localStorage.getItem("plecak:tasks");
+    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Konto Rejson"]')!.click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
+    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="community-title"]')!;
+    expect(dialog.textContent).toContain("Nie można teraz sprawdzić konta");
+    expect(dialog.textContent).not.toContain("Zalogowano jako FakeName");
+    expect(localStorage.getItem(COMMUNITY_SESSION_KEY)).toContain(token);
+    expect(localStorage.getItem("plecak:tasks")).toBe(original);
+  });
+});
--- /dev/null
+++ b/src/components/CommunityAccount.tsx
@@ -0,0 +1,110 @@
+import { useEffect, useRef, useState, type FormEvent } from 'react';
+import { authenticateCommunity, COMMUNITY_SESSION_KEY, forgetCommunitySession, readCommunitySession, saveCommunitySession, validCredentials, verifyCommunitySession, type CommunitySession } from '../lib/communityAccount';
+
+type View = 'checking' | 'guest' | 'connected' | 'unavailable';
+
+/** Opcjonalne konto: nie modyfikuje ani nie wysyła danych szkolnych. */
+export default function CommunityAccount({ onClose }: { onClose: () => void }) {
+  const [view, setView] = useState<View>('checking');
+  const [session, setSession] = useState<CommunitySession | null>(null);
+  const [mode, setMode] = useState<'login' | 'register'>('login');
+  const [name, setName] = useState('');
+  const [secret, setSecret] = useState('');
+  const [confirm, setConfirm] = useState('');
+  const [message, setMessage] = useState('');
+  const [busy, setBusy] = useState(false);
+  const serial = useRef(0);
+  const panel = useRef<HTMLDivElement>(null);
+  const busyRef = useRef(false);
+  busyRef.current = busy;
+
+  useEffect(() => {
+    let alive = true;
+    const previous = document.activeElement as HTMLElement | null;
+    panel.current?.focus();
+    const refresh = async () => {
+      const sequence = ++serial.current;
+      let stored: CommunitySession | null = null;
+      try { stored = readCommunitySession(window.localStorage); } catch { /* Pamięć może być zablokowana. */ }
+      if (!stored) { setSession(null); setView('guest'); return; }
+      setView('checking');
+      try {
+        const verified = await verifyCommunitySession(stored);
+        if (!alive || sequence !== serial.current) return;
+        try { if (readCommunitySession(window.localStorage)?.token !== stored.token) return; } catch { return; }
+        setSession(verified);
+        setView(verified ? 'connected' : 'guest');
+        if (!verified) setMessage('Sesja wygasła. Zaloguj się ponownie.');
+      } catch {
+        if (alive && sequence === serial.current) { setSession(null); setView('unavailable'); }
+      }
+    };
+    const storage = (event: StorageEvent) => { if (event.key === COMMUNITY_SESSION_KEY || event.key === null) void refresh(); };
+    const changed = () => { void refresh(); };
+    const keydown = (event: KeyboardEvent) => {
+      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); onClose(); }
+      if (event.key !== 'Tab' || !panel.current) return;
+      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
+      if (!items.length) { event.preventDefault(); panel.current.focus(); return; }
+      const first = items[0], last = items[items.length - 1];
+      if (!panel.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
+      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
+      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
+    };
+    void refresh();
+    window.addEventListener('storage', storage);
+    window.addEventListener('rj:session-change', changed);
+    window.addEventListener('keydown', keydown);
+    return () => { alive = false; ++serial.current; window.removeEventListener('storage', storage); window.removeEventListener('rj:session-change', changed); window.removeEventListener('keydown', keydown); previous?.focus(); };
+  }, [onClose]);
+
+  const submit = async (event: FormEvent) => {
+    event.preventDefault();
+    if (!validCredentials(mode, name, secret)) { setMessage('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.'); return; }
+    if (mode === 'register' && secret !== confirm) { setMessage('Hasła nie są takie same.'); return; }
+    const sequence = ++serial.current;
+    const password = secret;
+    setSecret(''); setConfirm(''); setMessage(''); setBusy(true);
+    try {
+      const verified = await authenticateCommunity(mode, name, password);
+      if (sequence !== serial.current) return;
+      try { saveCommunitySession(localStorage, verified); }
+      catch { throw new Error('Nie można zapisać sesji w tej przeglądarce.'); }
+      setSession(verified); setView('connected');
+      window.dispatchEvent(new Event('rj:session-change'));
+    } catch (error) {
+      if (sequence === serial.current) setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować.');
+    } finally { setBusy(false); }
+  };
+  const logout = () => {
+    ++serial.current;
+    try { forgetCommunitySession(localStorage); }
+    catch { setMessage('Nie udało się usunąć sesji z tej przeglądarki.'); return; }
+    setSession(null); setView('guest'); setMessage('Wylogowano na tym urządzeniu.');
+    window.dispatchEvent(new Event('rj:session-change'));
+  };
+
+  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4" role="presentation">
+    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="community-title" className="card my-auto w-full max-w-md !rounded-3xl p-5 text-ink shadow-2xl">
+      <div className="flex items-center justify-between gap-3"><h2 id="community-title" className="font-display text-2xl font-semibold">Konto Rejson</h2><button type="button" className="rounded-xl border border-line px-3 py-2 cursor-pointer hover:bg-line/50" onClick={onClose} disabled={busy} aria-label="Zamknij konto">✕</button></div>
+      <p className="my-3 text-sm text-muted">To samo konto co w RejChat i RejStream. Gra nadal działa bez konta.</p>
+      <p className="mb-3 text-sm text-muted">Oceny, plan i pozostałe dane Plecaka nadal są tylko na tym urządzeniu. Logowanie nie przenosi ich na inne urządzenia. W panelu „Twoje dane” możesz zrobić kopię plikową.</p>
+      {view === 'checking' && <p role="status">Sprawdzam konto…</p>}
+      {view === 'unavailable' && <p role="status">Nie można teraz sprawdzić konta. Spróbuj później; Twoje dane pozostają na urządzeniu.</p>}
+      {view === 'connected' && session && <div><p>Zalogowano jako <strong>{session.username}</strong>.</p><p className="mt-2 text-sm"><a className="underline" href="https://rejson59.github.io/logowanie" target="_blank" rel="noopener noreferrer">Ustaw lub zmień hasło na stronie konta</a> (na innej domenie może być potrzebne ponowne logowanie).</p><button type="button" className="mt-3 rounded-xl border border-line px-4 py-2 cursor-pointer hover:bg-line/50" onClick={logout}>Wyloguj na tym urządzeniu</button></div>}
+      {view === 'guest' && <>
+        <div className="my-3 flex gap-2" role="group" aria-label="Tryb konta">
+          <button type="button" className="rounded-xl border border-line px-4 py-2 cursor-pointer aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50" disabled={busy} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setSecret(''); setConfirm(''); setMessage(''); }}>Zaloguj</button>
+          <button type="button" className="rounded-xl border border-line px-4 py-2 cursor-pointer aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50" disabled={busy} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setSecret(''); setConfirm(''); setMessage(''); }}>Utwórz konto</button>
+        </div>
+        <form onSubmit={submit} className="flex flex-col gap-3">
+          <label className="flex flex-col gap-1 text-sm">Nazwa użytkownika<input className="rounded-xl border border-line bg-paper p-2 text-ink" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={24} required disabled={busy} /></label>
+          <label className="flex flex-col gap-1 text-sm">{mode === 'login' ? 'Hasło lub dotychczasowy PIN' : 'Hasło'}<input className="rounded-xl border border-line bg-paper p-2 text-ink" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={secret} onChange={(e) => setSecret(e.target.value)} required disabled={busy} /></label>
+          {mode === 'register' && <><label className="flex flex-col gap-1 text-sm">Powtórz hasło<input className="rounded-xl border border-line bg-paper p-2 text-ink" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} /></label><p className="text-xs text-muted">Minimum 10 znaków i maksymalnie 72 bajty. Nie ma automatycznego odzyskiwania zapomnianego hasła.</p></>}
+          <button type="submit" className="rounded-xl bg-ink px-4 py-2 font-semibold text-paper cursor-pointer disabled:opacity-50" disabled={busy}>{busy ? 'Łączenie…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button>
+        </form>
+      </>}
+      {message && <p className="mt-3 text-sm text-clay" role="status">{message}</p>}
+    </div>
+  </div>;
+}
--- a/src/components/Icon.tsx
+++ b/src/components/Icon.tsx
@@ -1,4 +1,5 @@
 const PATHS: Record<string, string> = {
+  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
   home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
   calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h2M14 12h2M8 16h2M14 16h2",
   check: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
--- /dev/null
+++ b/src/lib/communityAccount.test.ts
@@ -0,0 +1,38 @@
+import { describe, expect, it } from "vitest";
+import { authenticateCommunity, readCommunitySession, validCredentials, verifyCommunitySession } from "./communityAccount";
+
+const token = "x".repeat(48);
+const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
+describe("wspólne konto", () => {
+  it("allows existing PIN login but requires a password for new accounts", () => {
+    expect(validCredentials("login", "Rejson", "1234")).toBe(true);
+    expect(validCredentials("register", "Rejson", "1234")).toBe(false);
+    expect(validCredentials("register", "Rejson", "Dobre haslo123")).toBe(true);
+    expect(validCredentials("register", "Rejson", "ą".repeat(37))).toBe(false);
+    expect(validCredentials("login", "../konto", "1234")).toBe(false);
+  });
+  it("uses existing RPCs and accepts identity only from whoami", async () => {
+    for (const mode of ["login", "register"] as const) {
+      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
+      const request = (async (url: string | URL | Request, init?: RequestInit) => {
+        const text = String(url);
+        calls.push({ url: text, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
+        return text.endsWith("community_whoami") ? json({ username: "Rejson" }) : json({ token, username: "fake" });
+      }) as typeof fetch;
+      expect(await authenticateCommunity(mode, " Rejson ", "dlugie haslo 123", request)).toEqual({ token, username: "Rejson" });
+      expect(calls[0].url.endsWith(mode === "login" ? "community_login" : "community_register")).toBe(true);
+      expect(calls[0].body).toEqual({ p_username: "Rejson", p_pin: "dlugie haslo 123" });
+      expect(calls[1].body).toEqual({ p_token: token });
+      expect(calls.every(({ url }) => !url.includes("haslo") && !url.includes(token))).toBe(true);
+    }
+  });
+  it("fails closed on invalid response, expired session, and offline", async () => {
+    expect(await verifyCommunitySession({ token, username: "fake" }, (async () => json({ username: null })) as typeof fetch)).toBeNull();
+    await expect(verifyCommunitySession({ token, username: "fake" }, (async () => json({})) as typeof fetch)).rejects.toThrow();
+    await expect(verifyCommunitySession({ token, username: "fake" }, (async () => { throw new Error("offline"); }) as typeof fetch)).rejects.toThrow(/Nie udało się połączyć/);
+    expect(readCommunitySession({ getItem: () => "broken" })).toBeNull();
+    let calls = 0;
+    const partial = (async () => ++calls === 1 ? json({ token, username: "Rejson" }) : json({}, 503)) as typeof fetch;
+    await expect(authenticateCommunity("register", "Rejson", "dlugie haslo 123", partial)).rejects.toThrow(/Konto utworzono/);
+  });
+});
--- /dev/null
+++ b/src/lib/communityAccount.ts
@@ -0,0 +1,75 @@
+/** Wspólne konto Rejsona, niezależne od lokalnych danych aplikacji. */
+const API = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/';
+// Publiczny klucz anon. Dostęp do kont wymaga hasła/PIN-u lub tokenu sesji.
+const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
+export const COMMUNITY_SESSION_KEY = 'rejson_community_session_v1';
+export type CommunitySession = { token: string; username: string };
+type Stored = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
+type Requester = typeof fetch;
+
+function sessionShape(value: unknown): CommunitySession | null {
+  if (!value || typeof value !== 'object') return null;
+  const item = value as Record<string, unknown>;
+  return typeof item.token === 'string' && item.token.length >= 16 &&
+    typeof item.username === 'string' && item.username.length > 0
+    ? { token: item.token, username: item.username } : null;
+}
+export function readCommunitySession(storage: Pick<Storage, 'getItem'>): CommunitySession | null {
+  try { return sessionShape(JSON.parse(storage.getItem(COMMUNITY_SESSION_KEY) || 'null')); }
+  catch { return null; }
+}
+export function validCredentials(mode: 'login' | 'register', username: string, secret: string): boolean {
+  return /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username.trim()) &&
+    secret.length > 0 && new TextEncoder().encode(secret).length <= 72 &&
+    (mode === 'login' || Array.from(secret).length >= 10);
+}
+async function rpc(name: string, params: object, request: Requester): Promise<unknown> {
+  let response: Response;
+  const controller = new AbortController();
+  const timer = setTimeout(() => controller.abort(), 12000);
+  try {
+    response = await request(API + name, {
+      method: 'POST', cache: 'no-store',
+      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
+      body: JSON.stringify(params), signal: controller.signal,
+    });
+  } catch { throw new Error('Nie udało się połączyć z kontem. Spróbuj ponownie później.'); }
+  finally { clearTimeout(timer); }
+  const body: unknown = await response.json().catch(() => null);
+  if (!response.ok) {
+    const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Nie udało się połączyć z kontem.';
+    throw new Error(message);
+  }
+  return body;
+}
+/** Nie ufamy nazwie przechowywanej w przeglądarce; potwierdza ją serwer. */
+export async function verifyCommunitySession(session: CommunitySession, request: Requester = fetch): Promise<CommunitySession | null> {
+  const result = await rpc('community_whoami', { p_token: session.token }, request);
+  if (!result || typeof result !== 'object' || !('username' in result)) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
+  const { username } = result;
+  if (username === null) return null;
+  if (typeof username !== 'string' || !username) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
+  return { token: session.token, username };
+}
+/** Konto jest tworzone/logowane w grze; hasło/PIN nigdy nie trafia do URL ani localStorage. */
+export async function authenticateCommunity(mode: 'login' | 'register', username: string, secret: string, request: Requester = fetch): Promise<CommunitySession> {
+  const name = username.trim();
+  if (!validCredentials(mode, name, secret)) throw new Error('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.');
+  const response = await rpc(mode === 'register' ? 'community_register' : 'community_login', { p_username: name, p_pin: secret }, request);
+  const session = sessionShape(response);
+  if (!session) throw new Error(mode === 'register' ? 'Serwer przyjął rejestrację, ale odpowiedź była nieprawidłowa. Spróbuj się zalogować.' : 'Nieprawidłowa odpowiedź serwera konta.');
+  try {
+    const verified = await verifyCommunitySession(session, request);
+    if (!verified) throw new Error('Sesja wygasła.');
+    return verified;
+  } catch (error) {
+    if (mode === 'register') throw new Error('Konto utworzono, ale nie udało się potwierdzić sesji. Spróbuj się zalogować.');
+    throw error;
+  }
+}
+export function saveCommunitySession(storage: Stored, session: CommunitySession): void {
+  storage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(session));
+}
+export function forgetCommunitySession(storage: Pick<Stored, 'removeItem'>): void {
+  storage.removeItem(COMMUNITY_SESSION_KEY);
+}
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -3,6 +3,6 @@
 export default defineConfig({
   test: {
     environment: "node",
-    include: ["src/**/*.test.ts"],
+    include: ["src/**/*.test.{ts,tsx}"],
   },
 });

```
