package com.juyel.familycall;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class CallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_REJECT = "com.juyel.familycall.REJECT_CALL";
    public static final String EXTRA_CALL_ID = "call_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_REJECT.equals(intent.getAction())) return;
        String callId = intent.getStringExtra(EXTRA_CALL_ID);
        String token = DeviceSession.token(context);
        if (callId == null || token.isEmpty()) return;

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("callId", callId);
                body.put("action", "reject");
                ApiClient.post("/api/calls/action", body, token);
            } catch (Exception ignored) {
                // The notification can still be dismissed locally if the network is unavailable.
            }
        }).start();
    }
}
