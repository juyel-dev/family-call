package com.juyel.familycall;

import android.content.Context;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public final class PushRegistration {
    private static final String TAG = "FamilyCallPush";

    private PushRegistration() {}

    public static void register(Context context) {
        String deviceToken = DeviceSession.token(context);
        if (deviceToken.isEmpty() || FirebaseApp.getApps(context).isEmpty()) return;

        FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(fcmToken -> {
                    new Thread(() -> {
                        try {
                            JSONObject body = new JSONObject();
                            body.put("fcmToken", fcmToken);
                            ApiClient.post("/api/push/register", body, deviceToken);
                            Log.i(TAG, "Push token registered.");
                        } catch (Exception error) {
                            Log.w(TAG, "Could not register push token.", error);
                        }
                    }).start();
                })
                .addOnFailureListener(error -> Log.w(TAG, "Could not obtain FCM token.", error));
    }
}
