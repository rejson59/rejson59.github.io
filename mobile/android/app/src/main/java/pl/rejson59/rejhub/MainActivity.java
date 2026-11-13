/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */

package pl.rejson59.rejhub;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

/**
 * RejHub na Androida — powłoka aplikacji wokół rejhub.vercel.app.
 *
 * Aplikacja nie trzyma kopii strony: WebView ładuje aktualny RejHub, więc
 * zmiany w serwisie widać od razu po ich wdrożeniu, bez wydawania nowego APK.
 * Nowy APK jest potrzebny tylko wtedy, gdy zmienia się sama powłoka.
 *
 * Co robi ta klasa poza samym WebView:
 *  - dopisuje do User-Agenta „RejHubApp/<wersja> (<kod>)” (zapasowo — zwykle
 *    robi to `appendUserAgent` z capacitor.config.json), żeby strona wiedziała,
 *    że działa w aplikacji i jaką ma wersję,
 *  - obsługuje przycisk Wstecz: Android 13+ przez OnBackInvokedCallback
 *    (gest wstecz z podglądem), starsze wersje przez onBackPressed,
 *  - przyjmuje treści „Udostępnij do RejHub” (ACTION_SEND text/*) i podaje je
 *    stronie: na RejChacie przez zdarzenie `rj:share`, poza nim przez adres
 *    `/rejchat?share=…`, który strona czyta przy starcie,
 *  - otwiera w aplikacji linki https://rejhub.vercel.app/... i rejhub://...,
 *  - pobiera pliki (np. nowy APK) przez DownloadManager, z powiadomieniem.
 *
 * Natywne dodatki (aktualizacja w aplikacji, biometria) mieszkają w osobnych
 * pluginach: RejUpdaterPlugin i RejBiometricPlugin — rejestrowanych poniżej,
 * jeszcze przed utworzeniem mostka Capacitora.
 */
public class MainActivity extends BridgeActivity {

    private static final String SERVER = "https://rejhub.vercel.app";
    private static final String UA_MARK = "RejHubApp/";
    private static final String PUSH_ACTION = "OPEN_REJHUB";
    private static final int SHARE_LIMIT = 4000;

    private String pendingUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        /* Pluginy własne muszą być znane, zanim powstanie mostek. */
        registerPlugin(RejUpdaterPlugin.class);
        registerPlugin(RejBiometricPlugin.class);

        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        appendAppVersion(webView);
        CookieManager.getInstance().setAcceptCookie(true);
        installDownloadHandler(webView);
        installLongPressHandler(webView);
        installBackHandler();
    }

    /**
     * Wstecz: najpierw historia strony, potem wyjście z aplikacji.
     *
     * Od Androida 13 system nie woła już onBackPressed, gdy w manifeście jest
     * `enableOnBackInvokedCallback="true"` — wtedy gest obsługuje ten callback.
     */
    private void installBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBack
            );
        }
    }

    private void handleBack() {
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /* `public`, bo tyle ma BridgeActivity — Java nie pozwala zawęzić widoczności. */
    @Override
    public void onResume() {
        super.onResume();
        /* Gdy link przyszedł, zanim mostek był gotowy, próbujemy jeszcze raz. */
        openPendingUrl();
    }

    /** Rozpoznaje powiadomienie, „Udostępnij do RejHub” i linki do aplikacji. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;

        /* Dotknięcie powiadomienia: FCM przekazuje adres w danych powiadomienia. */
        if (PUSH_ACTION.equals(intent.getAction())) {
            String url = intent.getStringExtra("url");
            if (url != null && url.startsWith("http")) {
                pendingUrl = url.startsWith(SERVER) ? url : SERVER + "/";
                openPendingUrl();
            }
            return;
        }

        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (shared != null && shared.length() > 0) {
                deliverShare(shared.toString());
                return;
            }
        }

        pendingUrl = pathFromIntent(intent);
        openPendingUrl();
    }

    /**
     * Treść z innej aplikacji (link, notatka) trafia do czatu.
     *
     * Gdy RejChat jest już otwarty, wystarczy zdarzenie w stronie — nie
     * przeładowujemy widoku, więc otwarta rozmowa i wpisany tekst zostają.
     * W innym wypadku ładujemy /rejchat z parametrem `share`, który strona
     * czyta przy starcie i od razu usuwa z adresu.
     */
    private void deliverShare(String text) {
        String value = text.length() > SHARE_LIMIT ? text.substring(0, SHARE_LIMIT) : text;

        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        String current = webView == null ? null : webView.getUrl();

        if (webView != null && current != null && current.startsWith(SERVER + "/rejchat")) {
            final String js = "window.dispatchEvent(new CustomEvent('rj:share',{detail:{text:"
                + JSONObject.quote(value) + "}}))";
            webView.post(() -> webView.evaluateJavascript(js, null));
            return;
        }

        pendingUrl = SERVER + "/rejchat?share=" + Uri.encode(value);
        openPendingUrl();
    }

    /** Dopisuje wersję aplikacji do User-Agenta. Format: „… RejHubApp/1.0.7 (7)”. */
    private void appendAppVersion(WebView webView) {
        String current = webView.getSettings().getUserAgentString();
        if (current == null) current = "";
        if (current.contains(UA_MARK)) return;

        String versionName = "1.0.0";
        long versionCode = 1;
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (info.versionName != null) versionName = info.versionName;
            versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        } catch (PackageManager.NameNotFoundException ignored) {
            /* zostają wartości domyślne */
        }
        webView.getSettings().setUserAgentString(
            current + " " + UA_MARK + versionName + " (" + versionCode + ")");
    }

    /**
     * Długie dotknięcie linku otwiera menu RejHuba (Udostępnij / Kopiuj /
     * Przeglądarka) zamiast systemowego menu WebView.
     *
     * WebView nie przekazuje tego zdarzenia do strony, więc pytamy go o trafiony
     * element. Zwracamy `true` tylko dla linków — dzięki temu zaznaczanie tekstu
     * i menu obrazków działają jak dotychczas.
     */
    private void installLongPressHandler(WebView webView) {
        webView.setOnLongClickListener(view -> {
            WebView.HitTestResult hit = webView.getHitTestResult();
            if (hit == null) return false;
            int kind = hit.getType();
            if (kind != WebView.HitTestResult.ANCHOR_TYPE
                && kind != WebView.HitTestResult.IMAGE_ANCHOR_TYPE) return false;
            String url = hit.getExtra();
            if (url == null || !url.startsWith("http")) return false;
            String js = "window.dispatchEvent(new CustomEvent('rj:longpress',{detail:{url:"
                + JSONObject.quote(url) + "}}))";
            webView.evaluateJavascript(js, null);
            return true;
        });
    }

    /* Pobieranie plików (np. nowej wersji APK) zostaje w systemowym menedżerze
       pobierania — po zakończeniu użytkownik dostaje powiadomienie i dotknięciem
       instaluje aktualizację. Bez tego klik w link .apk nic by nie zrobił. */
    private void installDownloadHandler(WebView webView) {
        final Context context = this;
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (url == null || url.isEmpty()) return;
                if (!url.startsWith("http://") && !url.startsWith("https://")) return;
                try {
                    DownloadManager manager =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (manager == null) return;
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
                    if (contentDisposition != null) {
                        request.addRequestHeader("Content-Disposition", contentDisposition);
                    }
                    String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                    request.setTitle(name);
                    request.setDescription("RejHub — pobieranie");
                    if (mimeType != null) request.setMimeType(mimeType);
                    request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                    manager.enqueue(request);
                } catch (Exception ignored) {
                    /* W najgorszym razie link otworzy przeglądarka systemowa. */
                    try {
                        context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception alsoIgnored) {
                        /* nic więcej nie zrobimy */
                    }
                }
            }
        });
    }

    /* Zamienia Intent z linku na adres w serwisie. Obsługuje oba warianty:
       https://rejhub.vercel.app/<ścieżka>?<parametry> i rejhub://<ścieżka>. */
    private String pathFromIntent(Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data == null) return null;
        String scheme = data.getScheme();
        if (scheme == null) return null;

        String path = data.getEncodedPath();
        if (path == null || path.isEmpty()) path = "/";

        if ("rejhub".equalsIgnoreCase(scheme)) {
            String host = data.getHost();
            if (host != null && !host.isEmpty()) path = "/" + host + path;
            if (path.startsWith("//")) path = path.substring(1);
        } else if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            return null;
        }

        String query = data.getEncodedQuery();
        return SERVER + path + (query == null ? "" : "?" + query);
    }

    private void openPendingUrl() {
        if (pendingUrl == null) return;
        Bridge bridge = getBridge();
        if (bridge == null) return;
        final WebView webView = bridge.getWebView();
        if (webView == null) return;
        final String url = pendingUrl;
        pendingUrl = null;
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.loadUrl(url);
            }
        });
    }
}
