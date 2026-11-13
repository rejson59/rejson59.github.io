/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */

package pl.rejson59.rejhub;

import android.content.pm.PackageInstaller;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Odbiór wyniku instalacji z PackageInstallera.
 *
 * System nie instaluje APK bez pytania: w odpowiedzi przysyła Intent
 * z ekranem „Zaktualizować aplikację?”. Ten odbiornik pokazuje ten ekran.
 * Bez niego aktualizacja w aplikacji kończyłaby się cichym niczym.
 */
public class InstallResultReceiver extends BroadcastReceiver {

    public static final String ACTION_INSTALL_RESULT = "pl.rejson59.rejhub.INSTALL_RESULT";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            /* Stała należy do Intent, nie do PackageInstallera. */
            Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation != null) {
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(confirmation);
                } catch (Exception ignored) {
                    /* Gdy system odmówi, użytkownik może otworzyć plik z Pobranych. */
                }
            }
        }
    }
}
