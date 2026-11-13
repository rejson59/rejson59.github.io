/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */

package pl.rejson59.rejhub;

import android.app.PackageInstaller;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Aktualizacja APK bez wychodzenia z aplikacji.
 *
 * Wcześniej „Pobierz” w banerze otwierał DownloadManager, a potem systemowy
 * instalator — użytkownik wypadał z RejHuba. Tutaj plik leci w tle, w aplikacji
 * widać postęp, a instalacja jest zwykłym systemowym pytaniem „zaktualizować?”.
 *
 * Przebieg:
 *  1. sprawdzenie zgody „instaluj nieznane aplikacje” (Android 8+),
 *  2. pobranie APK z GitHub Releases (z przekierowaniami) i sprawdzenie
 *     SHA-256 z /app/latest.json,
 *  3. zapis do sesji PackageInstallera,
 *  4. system pokazuje pytanie o aktualizację — dane konta i ustawienia zostają.
 *
 * Metody:
 *   status()   → { supported, allowed, versionName, versionCode }
 *   install()  → { ok: true } po przekazaniu pliku systemowi
 *   settings() → otwiera ustawienia „instaluj nieznane aplikacje”
 *
 * Zdarzenia: `progress` → { percent, received, total } co ~2%.
 */
@CapacitorPlugin(name = "RejUpdater")
public class RejUpdaterPlugin extends Plugin {

    private static final String CACHE_NAME = "rejhub-update.apk";
    private static final int TIMEOUT_CONNECT = 15000;
    private static final int TIMEOUT_READ = 30000;

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("allowed", installAllowed());
        result.put("versionName", versionName());
        result.put("versionCode", versionCode());
        call.resolve(result);
    }

    @PluginMethod
    public void settings(PluginCall call) {
        openInstallSettings();
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        String expected = call.getString("sha256", "");
        String version = call.getString("versionName", "");

        if (url == null || url.length() == 0) {
            call.reject("Brak adresu aktualizacji.", "no_url");
            return;
        }
        if (!installAllowed()) {
            openInstallSettings();
            call.reject("Zezwól RejHubowi na instalowanie aplikacji, a potem spróbuj ponownie.", "permission");
            return;
        }

        final String source = url;
        final String sha256 = expected == null ? "" : expected.trim().toLowerCase();
        final File target = new File(getContext().getCacheDir(), CACHE_NAME);

        new Thread(() -> {
            try {
                long total = download(source, target);
                if (sha256.length() > 0) {
                    String actual = digest(target);
                    if (!actual.equalsIgnoreCase(sha256)) {
                        throw new IOException("Pobrany plik ma inną sumę kontrolną — przerwano dla bezpieczeństwa.");
                    }
                }
                handToInstaller(target);
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("versionName", version);
                result.put("bytes", total);
                call.resolve(result);
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null || message.length() == 0
                    ? "Nie udało się pobrać aktualizacji."
                    : message, "install_failed");
            }
        }, "rejhub-update").start();
    }

    /* ------------------------------------------------------------- pobieranie */

    /** Pobiera plik, śledząc przekierowania GitHuba, i raportuje postęp. */
    private long download(String url, File target) throws IOException {
        HttpURLConnection connection = open(url);
        long total = connection.getContentLengthLong();
        long received = 0;
        int lastPercent = -1;

        try (
            InputStream input = new BufferedInputStream(connection.getInputStream());
            OutputStream output = new FileOutputStream(target, false)
        ) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                received += read;
                if (total > 0) {
                    int percent = (int) Math.min(100, (received * 100) / total);
                    if (percent >= lastPercent + 2) {
                        lastPercent = percent;
                        postProgress(percent, received, total);
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
        return received;
    }

    /** Postęp liczymy w tle, ale zdarzenie wysyłamy z wątku głównego. */
    private void postProgress(int percent, long received, long total) {
        JSObject payload = new JSObject();
        payload.put("percent", percent);
        payload.put("received", received);
        payload.put("total", total);
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> notifyListeners("progress", payload));
    }

    private HttpURLConnection open(String url) throws IOException {
        String current = url;
        for (int hop = 0; hop < 6; hop += 1) {
            HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
            connection.setConnectTimeout(TIMEOUT_CONNECT);
            connection.setReadTimeout(TIMEOUT_READ);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "RejHubApp (Android)");
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive,*/*");

            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.length() == 0) {
                    throw new IOException("Serwer przekierował bez adresu docelowego.");
                }
                current = new URL(new URL(current), location).toString();
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                connection.disconnect();
                throw new IOException("Serwer odpowiedział " + code + " — spróbuj ponownie później.");
            }
            return connection;
        }
        throw new IOException("Zbyt wiele przekierowań.");
    }

    private String digest(File file) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) sha.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : sha.digest()) hex.append(String.format("%02x", value & 0xff));
        return hex.toString();
    }

    /* ------------------------------------------------------------ instalacja */

    private void handToInstaller(File apk) throws IOException {
        Context context = getContext();
        PackageManager manager = context.getPackageManager();
        PackageInstaller installer = manager.getPackageInstaller();
        if (installer == null) throw new IOException("System nie udostępnia instalatora pakietów.");

        PackageInstaller.SessionParams params =
            new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName());

        int sessionId = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            try (
                InputStream input = new FileInputStream(apk);
                OutputStream output = session.openWrite(CACHE_NAME, 0, apk.length())
            ) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                session.fsync(output);
            }

            Intent result = new Intent(context, InstallResultReceiver.class);
            result.setAction(InstallResultReceiver.ACTION_INSTALL_RESULT);
            result.setPackage(context.getPackageName());

            android.app.PendingIntent pending = android.app.PendingIntent.getBroadcast(
                context,
                1201,
                result,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE
            );
            session.commit(pending.getIntentSender());
        }
    }

    private boolean installAllowed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void openInstallSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
            /* starsze systemy nie mają tego ekranu — zostaje zwykły instalator */
        }
    }

    private String versionName() {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (PackageManager.NameNotFoundException ignored) {
            return "";
        }
    }

    private long versionCode() {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        } catch (PackageManager.NameNotFoundException ignored) {
            return 0;
        }
    }
}
