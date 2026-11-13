/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */

package pl.rejson59.rejhub;

import android.app.Activity;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Odblokowanie RejSejfu odciskiem palca (albo twarzą).
 *
 * Hasło do konta nadal jest wymagane do zalogowania — biometria jest tylko
 * lokalną zasłoną na już otwartą sesję: gdy telefon leży odblokowany na stole,
 * nikt bez Twojego palca nie zobaczy notatek.
 *
 * Metody:
 *   available()      → { available, reason }
 *   authenticate()   → { ok: true } | odrzucenie z kodem „cancelled”
 *
 * Nic nie jest zapisywane w chmurze ani w bazie — ustawienie „zablokowany”
 * siedzi wyłącznie w localStorage przeglądarki (WebView) na tym telefonie.
 */
@CapacitorPlugin(name = "RejBiometric")
public class RejBiometricPlugin extends Plugin {

    private static final int ALLOWED = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        int status = BiometricManager.from(getContext()).canAuthenticate(ALLOWED);
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("reason", reason(status));
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            call.reject("Ten ekran nie obsługuje biometrii.", "unavailable");
            return;
        }

        String title = call.getString("title", "Odblokuj RejSejf");
        String subtitle = call.getString("subtitle", "Potwierdź tożsamość, żeby zobaczyć swoje rzeczy.");
        String cancel = call.getString("cancel", "Anuluj");

        final FragmentActivity host = (FragmentActivity) activity;
        host.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                host,
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject ok = new JSObject();
                        ok.put("ok", true);
                        call.resolve(ok);
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence message) {
                        String text = message == null ? "Anulowano." : message.toString();
                        call.reject(text, code == BiometricPrompt.ERROR_USER_CANCELED
                            || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || code == BiometricPrompt.ERROR_CANCELED ? "cancelled" : "error");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        /* Błędny palec — prompt zostaje otwarty, użytkownik próbuje dalej. */
                    }
                }
            );

            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(ALLOWED)
                .setNegativeButtonText(cancel)
                .build();

            prompt.authenticate(info);
        });
    }

    private String reason(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "gotowe";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "Telefon nie ma czytnika biometrii.";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Czytnik jest chwilowo niedostępny.";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "Najpierw dodaj odcisk palca w ustawieniach telefonu.";
            default:
                return "Biometria jest niedostępna na tym urządzeniu.";
        }
    }
}
