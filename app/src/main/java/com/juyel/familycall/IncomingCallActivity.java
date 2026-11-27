package com.juyel.familycall;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

public class IncomingCallActivity extends Activity {
    public static final String EXTRA_CALL_ID = "call_id";
    public static final String EXTRA_CALLER_NAME = "caller_name";
    public static final String EXTRA_CALL_TYPE = "call_type";

    private Ringtone ringtone;
    private String callId = "";
    private String callerName = "Family contact";
    private String callType = "audio";
    private final int white = Color.WHITE;
    private final int secondary = Color.rgb(198, 210, 216);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(16, 28, 42));
        window.setNavigationBarColor(Color.rgb(16, 28, 42));
        window.getDecorView().setSystemUiVisibility(0);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            window.addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        callId = getIntent().getStringExtra(EXTRA_CALL_ID);
        String incomingName = getIntent().getStringExtra(EXTRA_CALLER_NAME);
        if (incomingName != null && !incomingName.trim().isEmpty()) callerName = incomingName;
        String incomingType = getIntent().getStringExtra(EXTRA_CALL_TYPE);
        if ("video".equals(incomingType)) callType = "video";

        buildScreen();
        startRingtone();
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(48), dp(28), dp(38));
        root.setBackgroundColor(Color.rgb(16, 28, 42));

        TextView label = text("INCOMING " + callType.toUpperCase() + " CALL", 12, secondary, true);
        label.setLetterSpacing(0.12f);
        root.addView(label);

        TextView avatar = text(initial(callerName), 42, Color.WHITE, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(circle(Color.rgb(8, 127, 114)));
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        avatarParams.topMargin = dp(65);
        root.addView(avatar, avatarParams);

        TextView name = text(callerName, 30, white, true);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        nameParams.topMargin = dp(22);
        root.addView(name, nameParams);

        TextView subtitle = text("Family Call  •  Calling…", 14, secondary, false);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(8);
        root.addView(subtitle, subtitleParams);

        View spacer = new View(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LinearLayout reject = callAction("✕", "Reject", Color.rgb(214, 65, 79));
        LinearLayout accept = callAction("☎", "Accept", Color.rgb(28, 166, 103));
        actions.addView(reject, new LinearLayout.LayoutParams(0, dp(98), 1f));
        LinearLayout.LayoutParams acceptParams = new LinearLayout.LayoutParams(0, dp(98), 1f);
        acceptParams.leftMargin = dp(34);
        actions.addView(accept, acceptParams);
        root.addView(actions);

        if (callId == null || callId.isEmpty()) {
            TextView note = text("Local preview only", 11, Color.rgb(151, 168, 178), false);
            note.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            noteParams.topMargin = dp(28);
            root.addView(note, noteParams);
        }

        setContentView(root);
    }

    private LinearLayout callAction(String icon, String label, int color) {
        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.setGravity(Gravity.CENTER);
        wrapper.setClickable(true);
        wrapper.setFocusable(true);

        TextView symbol = text(icon, 24, white, true);
        symbol.setGravity(Gravity.CENTER);
        symbol.setBackground(circle(color));
        symbol.setContentDescription(label);
        wrapper.addView(symbol, new LinearLayout.LayoutParams(dp(64), dp(64)));

        TextView caption = text(label, 12, white, true);
        caption.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        captionParams.topMargin = dp(7);
        wrapper.addView(caption, captionParams);

        wrapper.setOnClickListener(v -> {
            if ("Reject".equals(label)) rejectCall();
            else acceptCall();
        });
        symbol.setOnClickListener(v -> wrapper.performClick());
        caption.setOnClickListener(v -> wrapper.performClick());
        return wrapper;
    }

    private void acceptCall() {
        stopRingtone();
        if (callId == null || callId.isEmpty()) {
            new AlertDialog.Builder(this)
                    .setTitle("Preview only")
                    .setMessage("This screen is a local ringtone preview. A remote call needs a real incoming call.")
                    .setPositiveButton("OK", (dialog, which) -> finish())
                    .show();
            return;
        }

        String token = DeviceSession.token(this);
        if (token.isEmpty()) {
            Toast.makeText(this, "Set up this device before answering.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("callId", callId);
                body.put("action", "accept");
                ApiClient.post("/api/calls/action", body, token);

                runOnUiThread(() -> {
                    NotificationManager manager = getSystemService(NotificationManager.class);
                    if (manager != null) manager.cancel(2401);
                    Intent intent = new Intent(this, CallSessionActivity.class);
                    intent.putExtra(CallSessionActivity.EXTRA_CALL_ID, callId);
                    intent.putExtra(CallSessionActivity.EXTRA_CALLER_NAME, callerName);
                    intent.putExtra(CallSessionActivity.EXTRA_CALL_TYPE, callType);
                    startActivity(intent);
                    finish();
                });
            } catch (Exception error) {
                runOnUiThread(() -> new AlertDialog.Builder(this)
                        .setTitle("Could not answer call")
                        .setMessage(error.getMessage() == null ? "Check your internet connection and try again." : error.getMessage())
                        .setPositiveButton("OK", (dialog, which) -> finish())
                        .show());
            }
        }).start();
    }

    private void rejectCall() {
        stopRingtone();
        if (callId == null || callId.isEmpty()) {
            finish();
            return;
        }
        String token = DeviceSession.token(this);
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("callId", callId);
                body.put("action", "reject");
                if (!token.isEmpty()) ApiClient.post("/api/calls/action", body, token);
            } catch (Exception ignored) {
                // Best-effort rejection: the local screen still closes if the network is down.
            }
        }).start();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(2401);
        finish();
    }

    private void startRingtone() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ringtone = RingtoneManager.getRingtone(this, uri);
            if (ringtone != null) {
                ringtone.setStreamType(AudioManager.STREAM_RING);
                if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                ringtone.play();
            }
        } catch (Exception ignored) {
            Toast.makeText(this, "Could not play the default ringtone.", Toast.LENGTH_SHORT).show();
        }
    }

    private void stopRingtone() {
        if (ringtone != null) {
            if (ringtone.isPlaying()) ringtone.stop();
            ringtone = null;
        }
    }

    @Override
    protected void onDestroy() {
        stopRingtone();
        super.onDestroy();
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable circle(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setShape(GradientDrawable.OVAL);
        return drawable;
    }

    private String initial(String name) {
        return name.isEmpty() ? "?" : name.substring(0, 1).toUpperCase();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
