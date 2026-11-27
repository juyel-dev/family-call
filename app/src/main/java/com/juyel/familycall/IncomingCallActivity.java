package com.juyel.familycall;

import android.app.Activity;
import android.app.AlertDialog;
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

public class IncomingCallActivity extends Activity {
    public static final String EXTRA_CALLER_NAME = "caller_name";

    private Ringtone ringtone;
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

        String caller = getIntent().getStringExtra(EXTRA_CALLER_NAME);
        if (caller == null || caller.trim().isEmpty()) caller = "Family contact";
        buildScreen(caller);
        startRingtone();
    }

    private void buildScreen(String caller) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(48), dp(28), dp(38));
        root.setBackgroundColor(Color.rgb(16, 28, 42));

        TextView label = text("INCOMING AUDIO CALL", 12, secondary, true);
        label.setLetterSpacing(0.12f);
        root.addView(label);

        TextView avatar = text(initial(caller), 42, Color.WHITE, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(circle(Color.rgb(8, 127, 114)));
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        avatarParams.topMargin = dp(65);
        root.addView(avatar, avatarParams);

        TextView name = text(caller, 30, white, true);
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

        TextView note = text("Preview only — remote calling is not connected", 11,
                Color.rgb(151, 168, 178), false);
        note.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        noteParams.topMargin = dp(28);
        root.addView(note, noteParams);

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
            if ("Reject".equals(label)) {
                finish();
            } else {
                stopRingtone();
                new AlertDialog.Builder(this)
                        .setTitle("Call service not connected")
                        .setMessage("This is the incoming-call UI preview. Remote calling has not been connected yet.")
                        .setPositiveButton("OK", (dialog, which) -> finish())
                        .setOnCancelListener(dialog -> finish())
                        .show();
            }
        });
        symbol.setOnClickListener(v -> wrapper.performClick());
        caption.setOnClickListener(v -> wrapper.performClick());
        return wrapper;
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
