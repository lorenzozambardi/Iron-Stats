package com.algorithmic.bodybuilding;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Locale;

public class StopwatchService extends Service {
    public static final String CHANNEL_ID = "iron_stats_stopwatch_channel";
    public static final int NOTIFICATION_ID = 4242;

    public static final String ACTION_START = "com.algorithmic.bodybuilding.ACTION_START";
    public static final String ACTION_PAUSE = "com.algorithmic.bodybuilding.ACTION_PAUSE";
    public static final String ACTION_RESET = "com.algorithmic.bodybuilding.ACTION_RESET";

    private static final String PREFS_NAME = "iron_stats_stopwatch_prefs";
    private static final String PREF_IS_RUNNING = "is_running";
    private static final String PREF_START_TIME = "start_time";
    private static final String PREF_ACCUMULATED_TIME = "accumulated_time";

    public interface StateChangeListener {
        void onStateChanged(boolean isRunning, long startTime, long accumulatedMs);
    }

    private static StateChangeListener stateListener = null;

    public static void setStateListener(StateChangeListener listener) {
        stateListener = listener;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                startStopwatch();
            } else if (ACTION_PAUSE.equals(action)) {
                pauseStopwatch();
            } else if (ACTION_RESET.equals(action)) {
                resetStopwatch();
            }
        }

        // Show persistent foreground notification
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (SecurityException e) {
            // Handled safely if notification permission is pending
        }

        return START_STICKY;
    }

    public static long getElapsed(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long startTime = prefs.getLong(PREF_START_TIME, 0);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        if (isRunning && startTime > 0) {
            return accumulated + Math.max(0, System.currentTimeMillis() - startTime);
        }
        return accumulated;
    }

    public static boolean isRunning(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(PREF_IS_RUNNING, false);
    }

    private void startStopwatch() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        if (!isRunning) {
            long now = System.currentTimeMillis();
            prefs.edit()
                .putBoolean(PREF_IS_RUNNING, true)
                .putLong(PREF_START_TIME, now)
                .apply();

            updateNotification();
            notifyListener(true, now, accumulated);
        }
    }

    private void pauseStopwatch() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long startTime = prefs.getLong(PREF_START_TIME, 0);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        if (isRunning) {
            long now = System.currentTimeMillis();
            long newAccumulated = accumulated + Math.max(0, now - startTime);
            prefs.edit()
                .putBoolean(PREF_IS_RUNNING, false)
                .putLong(PREF_ACCUMULATED_TIME, newAccumulated)
                .putLong(PREF_START_TIME, 0)
                .apply();

            updateNotification();
            notifyListener(false, 0, newAccumulated);
        }
    }

    private void resetStopwatch() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean(PREF_IS_RUNNING, false)
            .putLong(PREF_START_TIME, 0)
            .putLong(PREF_ACCUMULATED_TIME, 0)
            .apply();

        updateNotification();
        notifyListener(false, 0, 0);
    }

    private void notifyListener(boolean running, long startTime, long accumulatedMs) {
        if (stateListener != null) {
            stateListener.onStateChanged(running, startTime, accumulatedMs);
        }
    }

    private void updateNotification() {
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(this);
            manager.notify(NOTIFICATION_ID, buildNotification());
        } catch (SecurityException e) {
            // Handled safely
        }
    }

    private Notification buildNotification() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long startTime = prefs.getLong(PREF_START_TIME, 0);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        long currentElapsed = accumulated;
        if (isRunning && startTime > 0) {
            currentElapsed += Math.max(0, System.currentTimeMillis() - startTime);
        }

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(contentPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        // Reset Action
        Intent resetIntent = new Intent(this, StopwatchService.class);
        resetIntent.setAction(ACTION_RESET);
        PendingIntent resetPendingIntent = PendingIntent.getService(
            this,
            3,
            resetIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (isRunning) {
            // Pause Action
            Intent pauseIntent = new Intent(this, StopwatchService.class);
            pauseIntent.setAction(ACTION_PAUSE);
            PendingIntent pausePendingIntent = PendingIntent.getService(
                this,
                1,
                pauseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            builder.setUsesChronometer(true)
                .setChronometerCountDown(false)
                .setWhen(System.currentTimeMillis() - currentElapsed)
                .setContentText("Running...")
                .addAction(android.R.drawable.ic_media_pause, "Pause", pausePendingIntent)
                .addAction(android.R.drawable.ic_menu_revert, "Reset", resetPendingIntent);
        } else {
            // Start / Resume Action
            Intent startIntent = new Intent(this, StopwatchService.class);
            startIntent.setAction(ACTION_START);
            PendingIntent startPendingIntent = PendingIntent.getService(
                this,
                2,
                startIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            String status = currentElapsed == 0 ? "Ready • 00:00" : "Paused • " + formatTime(currentElapsed);
            builder.setUsesChronometer(false)
                .setContentText(status)
                .addAction(android.R.drawable.ic_media_play, currentElapsed == 0 ? "Start" : "Resume", startPendingIntent)
                .addAction(android.R.drawable.ic_menu_revert, "Reset", resetPendingIntent);
        }

        return builder.build();
    }

    private static String formatTime(long ms) {
        long totalSeconds = ms / 1000;
        long minutes = totalSeconds / 60;
        long seconds = totalSeconds % 60;
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Stopwatch",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Persistent stopwatch for gym rest timer");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.enableLights(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        if (!isRunning && accumulated == 0) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
