package com.algorithmic.bodybuilding;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "Stopwatch",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class StopwatchPlugin extends Plugin {

    private static final String PREFS_NAME = "iron_stats_stopwatch_prefs";
    private static final String PREF_IS_RUNNING = "is_running";
    private static final String PREF_START_TIME = "start_time";
    private static final String PREF_ACCUMULATED_TIME = "accumulated_time";

    @Override
    public void load() {
        super.load();
        StopwatchService.setStateListener((isRunning, elapsedMs) -> {
            JSObject ret = new JSObject();
            ret.put("isRunning", isRunning);
            ret.put("time", elapsedMs);
            notifyListeners("stopwatchChange", ret);
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isRunning = prefs.getBoolean(PREF_IS_RUNNING, false);
        long startTime = prefs.getLong(PREF_START_TIME, 0);
        long accumulated = prefs.getLong(PREF_ACCUMULATED_TIME, 0);

        long currentElapsed = accumulated;
        if (isRunning && startTime > 0) {
            currentElapsed += Math.max(0, System.currentTimeMillis() - startTime);
        }

        JSObject ret = new JSObject();
        ret.put("isRunning", isRunning);
        ret.put("time", currentElapsed);
        ret.put("startTime", startTime);
        ret.put("accumulatedTime", accumulated);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), StopwatchService.class);
        intent.setAction(StopwatchService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Intent intent = new Intent(getContext(), StopwatchService.class);
        intent.setAction(StopwatchService.ACTION_PAUSE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void reset(PluginCall call) {
        Intent intent = new Intent(getContext(), StopwatchService.class);
        intent.setAction(StopwatchService.ACTION_RESET);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }
}
