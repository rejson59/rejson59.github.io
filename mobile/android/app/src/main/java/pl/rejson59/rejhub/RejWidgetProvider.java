/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */

package pl.rejson59.rejhub;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Widżet „RejHub · skróty” na ekran główny telefonu.
 *
 * Cztery najczęściej używane miejsca (czat, pliki, sejf, lekcje) otwierane
 * jednym dotknięciem — bez szukania ikony i bez ładowania strony głównej.
 * Widżet jest statyczny: nie trzyma treści ani danych, więc nie zużywa
 * baterii i nie wycieka niczego na ekran blokady.
 */
public class RejWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        RemoteViews views = build(context);
        for (int widgetId : widgetIds) {
            manager.updateAppWidget(widgetId, views);
        }
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget);
        views.setOnClickPendingIntent(R.id.rj_widget_chat, open(context, "/rejchat", 101));
        views.setOnClickPendingIntent(R.id.rj_widget_file, open(context, "/rejfile", 102));
        views.setOnClickPendingIntent(R.id.rj_widget_sejf, open(context, "/rejsejf", 103));
        views.setOnClickPendingIntent(R.id.rj_widget_class, open(context, "/rejclass", 104));
        return views;
    }

    /** Każdy skrót to zwykły link RejHuba — ta sama ścieżka co w App Links. */
    private static PendingIntent open(Context context, String path, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("https://rejhub.vercel.app" + path));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
