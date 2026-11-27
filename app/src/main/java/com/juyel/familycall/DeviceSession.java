package com.juyel.familycall;

import android.content.Context;
import android.content.SharedPreferences;

public final class DeviceSession {
    private static final String PREFS = "family_call_private";
    private static final String TOKEN = "device_token";
    private static final String DEVICE_ID = "device_id";

    private DeviceSession() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String token(Context context) {
        return prefs(context).getString(TOKEN, "");
    }

    public static String deviceId(Context context) {
        return prefs(context).getString(DEVICE_ID, "");
    }

    public static boolean isPaired(Context context) {
        return !token(context).isEmpty() && !deviceId(context).isEmpty();
    }

    public static void save(Context context, String deviceId, String token) {
        prefs(context).edit().putString(DEVICE_ID, deviceId).putString(TOKEN, token).apply();
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
