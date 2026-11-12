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

/**
 * RejHub na Androida — cienka powłoka wokół rejhub.vercel.app.
 *
 * Aplikacja nie trzyma kopii strony: WebView ładuje aktualny RejHub, więc
 * zmiany w serwisie widać od razu po ich wdrożeniu, bez wydawania nowego APK.
 * Nowy APK jest potrzebny tylko wtedy, gdy zmienia się sama powłoka (uprawnienia,
 * linki, sposób pobierania) — wtedy wydanie tworzy GitHub Actions, a strona
 * /pobierz i baner w aplikacji pokazują nowszą wersję.
 *
 * Co robi ta klasa poza samym WebView:
 *  - dopisuje do User-Agenta „RejHubApp/<wersja> (<kod>)”, żeby strona wiedziała,
 *    że działa w aplikacji i jaką ma wersję (stąd baner aktualizacji),
 *  - obsługuje przycisk Wstecz (wraca w historii strony, potem zamyka aplikację),
 *  - otwiera linki https://rejhub.vercel.app/... i rejhub://... w aplikacji,
 *  - pobiera pliki (np. nowy APK) przez DownloadManager, z powiadomieniem.
 */
public class MainActivity extends BridgeActivity {

    private static final String SERVER = "https://rejhub.vercel.app";
    private static final String UA_MARK = "RejHubApp/";

    private String pendingUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        appendAppVersion(webView);
        CookieManager.getInstance().setAcceptCookie(true);
        installDownloadHandler(webView);

        pendingUrl = pathFromIntent(getIntent());
        openPendingUrl();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingUrl = pathFromIntent(intent);
        openPendingUrl();
    }

    /* `public`, bo tyle ma BridgeActivity — Java nie pozwala zawęzić widoczności. */
    @Override
    public void onResume() {
        super.onResume();
        /* Gdy link przyszedł, zanim mostek był gotowy, próbujemy jeszcze raz. */
        openPendingUrl();
    }

    /** Wstecz: najpierw historia strony, potem normalne wyjście z aplikacji. */
    @Override
    public void onBackPressed() {
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
            bridge.getWebView().goBack();
            return;
        }
        super.onBackPressed();
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
