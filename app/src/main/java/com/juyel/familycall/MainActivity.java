package com.juyel.familycall;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.text.InputType;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int TAB_MISSED = 0;
    private static final int TAB_CALL = 1;
    private static final int TAB_SETTINGS = 2;

    private final int ink = Color.rgb(23, 43, 42);
    private final int muted = Color.rgb(113, 129, 127);
    private final int teal = Color.rgb(8, 127, 114);
    private final int pale = Color.rgb(230, 244, 241);
    private final int page = Color.rgb(244, 247, 248);
    private final int border = Color.rgb(227, 235, 233);

    private int selectedTab = TAB_CALL;
    private LinearLayout appRoot;
    private FrameLayout contentFrame;
    private Ringtone previewRingtone;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(page);
        window.setNavigationBarColor(Color.WHITE);
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        renderApp();
        if (DeviceSession.isPaired(this)) {
            PushRegistration.register(this);
            ensureCallPermissionsForNotifications();
        } else {
            handler.postDelayed(this::showPairingDialog, 300);
        }
    }

    @Override
    protected void onDestroy() {
        stopPreviewRingtone();
        super.onDestroy();
    }

    private void renderApp() {
        appRoot = new LinearLayout(this);
        appRoot.setOrientation(LinearLayout.VERTICAL);
        appRoot.setBackgroundColor(page);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(22), dp(18), dp(22), dp(14));
        header.setBackgroundColor(page);

        TextView eyebrow = text("PRIVATE FAMILY SPACE  •  3 PEOPLE", 10, muted, true);
        eyebrow.setLetterSpacing(0.08f);
        header.addView(eyebrow);

        TextView title = text("Family Call", 27, ink, true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(4);
        header.addView(title, titleParams);

        TextView subtitle = text("Simple calls with your family", 13, muted, false);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subParams.topMargin = dp(3);
        header.addView(subtitle, subParams);
        appRoot.addView(header);

        contentFrame = new FrameLayout(this);
        appRoot.addView(contentFrame, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        appRoot.addView(buildBottomNavigation());
        setContentView(appRoot);
        renderSelectedTab();
    }

    private LinearLayout buildBottomNavigation() {
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(8), dp(8), dp(7));
        nav.setBackgroundColor(Color.WHITE);

        View topLine = new View(this);
        topLine.setBackgroundColor(border);

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.addView(topLine, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));
        wrapper.addView(nav, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(66)));

        addNavItem(nav, "◷", "Missed Call", TAB_MISSED);
        addNavItem(nav, "☎", "Call", TAB_CALL);
        addNavItem(nav, "⚙", "Setting", TAB_SETTINGS);
        return wrapper;
    }

    private void addNavItem(LinearLayout nav, String symbol, String label, int tab) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER);
        item.setPadding(dp(4), dp(3), dp(4), dp(2));
        item.setClickable(true);
        item.setFocusable(true);

        int activeColor = selectedTab == tab ? teal : muted;
        TextView icon = text(symbol, 21, activeColor, true);
        TextView caption = text(label, 10, activeColor, selectedTab == tab);
        LinearLayout.LayoutParams captionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        captionParams.topMargin = dp(1);
        item.addView(icon);
        item.addView(caption, captionParams);
        item.setOnClickListener(v -> {
            selectedTab = tab;
            renderApp();
        });
        nav.addView(item, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.MATCH_PARENT, 1f));
    }

    private void renderSelectedTab() {
        contentFrame.removeAllViews();
        View selected;
        if (selectedTab == TAB_MISSED) {
            selected = buildMissedCallsPage();
        } else if (selectedTab == TAB_SETTINGS) {
            selected = buildSettingsPage();
        } else {
            selected = buildCallPage();
        }
        contentFrame.addView(selected, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private void renderAppAndKeepTab() {
        renderApp();
    }

    private View buildCallPage() {
        LinearLayout body = pageColumn();
        TextView heading = text("Call someone", 19, ink, true);
        body.addView(heading);

        TextView hint = text("Choose a family contact and call type.", 13, muted, false);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(4);
        hintParams.bottomMargin = dp(16);
        body.addView(hint, hintParams);

        String ownDevice = DeviceSession.deviceId(this);
        if ("ma".equals(ownDevice)) {
            body.addView(buildContactCard("Juyel", "J", "Laptop", "juyel"));
            body.addView(buildContactCard("Mim", "M", "Family phone", "mim"));
        } else if ("mim".equals(ownDevice)) {
            body.addView(buildContactCard("Ma", "Ma", "OPPO phone", "ma"));
            body.addView(buildContactCard("Juyel", "J", "Laptop", "juyel"));
        } else {
            body.addView(buildContactCard("Ma", "Ma", "OPPO phone", "ma"));
            body.addView(buildContactCard("Mim", "M", "Family phone", "mim"));
        }

        TextView privacy = text("Private contact list • No account or sign-up", 11, muted, false);
        privacy.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams privacyParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        privacyParams.topMargin = dp(5);
        body.addView(privacy, privacyParams);
        return scroll(body);
    }

    private View buildContactCard(String name, String initial, String detail, String targetDeviceId) {
        LinearLayout card = cardColumn();

        LinearLayout identity = new LinearLayout(this);
        identity.setOrientation(LinearLayout.HORIZONTAL);
        identity.setGravity(Gravity.CENTER_VERTICAL);

        TextView avatar = text(initial, 20, teal, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(round(pale, dp(48), border, dp(1)));
        identity.addView(avatar, new LinearLayout.LayoutParams(dp(48), dp(48)));

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(12), 0, 0, 0);
        TextView person = text(name, 17, ink, true);
        TextView description = text(detail, 12, muted, false);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        descriptionParams.topMargin = dp(3);
        labels.addView(person);
        labels.addView(description, descriptionParams);
        identity.addView(labels, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(identity);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        actionsParams.topMargin = dp(17);

        TextView audio = actionButton("☎  Audio call", true);
        audio.setOnClickListener(v -> startOutgoingCall(targetDeviceId, "audio"));
        TextView video = actionButton("▣  Video call", false);
        video.setOnClickListener(v -> startOutgoingCall(targetDeviceId, "video"));

        actions.addView(audio, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.MATCH_PARENT, 1f));
        LinearLayout.LayoutParams videoParams = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.MATCH_PARENT, 1f);
        videoParams.leftMargin = dp(9);
        actions.addView(video, videoParams);
        card.addView(actions, actionsParams);
        return card;
    }

    private View buildMissedCallsPage() {
        LinearLayout body = pageColumn();
        body.addView(text("Missed calls", 19, ink, true));

        LinearLayout empty = cardColumn();
        empty.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams emptyParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(230));
        emptyParams.topMargin = dp(18);

        TextView icon = text("◷", 40, teal, true);
        TextView title = text("No missed calls", 17, ink, true);
        TextView hint = text("Calls you don't answer will appear here.", 12, muted, false);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(12);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(6);
        empty.addView(icon);
        empty.addView(title, titleParams);
        empty.addView(hint, hintParams);
        body.addView(empty, emptyParams);
        return scroll(body);
    }

    private View buildSettingsPage() {
        LinearLayout body = pageColumn();
        body.addView(text("Settings", 19, ink, true));

        TextView section = text("CALL PREFERENCES", 10, muted, true);
        section.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams sectionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sectionParams.topMargin = dp(18);
        sectionParams.bottomMargin = dp(9);
        body.addView(section, sectionParams);

        LinearLayout preferences = cardColumn();
        addSwitchRow(preferences, "Ringtone", "Play a ringtone for incoming calls", true);
        addDivider(preferences);
        addSwitchRow(preferences, "Vibration", "Vibrate when a call arrives", true);
        body.addView(preferences);

        TextView testSection = text("TEST", 10, muted, true);
        testSection.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams testSectionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        testSectionParams.topMargin = dp(9);
        testSectionParams.bottomMargin = dp(9);
        body.addView(testSection, testSectionParams);

        LinearLayout testCard = cardColumn();
        TextView testTitle = text("Preview incoming call", 15, ink, true);
        TextView testHint = text("Opens the native full-screen call screen on this phone. This is a local demo, not a remote call.", 12, muted, false);
        testCard.addView(testTitle);
        LinearLayout.LayoutParams testHintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        testHintParams.topMargin = dp(5);
        testCard.addView(testHint, testHintParams);

        TextView testButton = actionButton("Test incoming call screen", true);
        LinearLayout.LayoutParams testButtonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        testButtonParams.topMargin = dp(14);
        testCard.addView(testButton, testButtonParams);
        testButton.setOnClickListener(v -> {
            Intent intent = new Intent(this, IncomingCallActivity.class);
            intent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, "Mim");
            startActivity(intent);
        });
        body.addView(testCard);

        TextView batteryTitle = text("BATTERY", 10, muted, true);
        batteryTitle.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams batteryTitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        batteryTitleParams.topMargin = dp(18);
        batteryTitleParams.bottomMargin = dp(9);
        body.addView(batteryTitle, batteryTitleParams);

        LinearLayout batteryCard = cardColumn();
        batteryCard.addView(text("Battery-friendly by design", 14, ink, true));
        TextView batteryHint = text("No microphone, camera, GPS or continuous background polling is used while idle.", 12, muted, false);
        LinearLayout.LayoutParams batteryHintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        batteryHintParams.topMargin = dp(5);
        batteryCard.addView(batteryHint, batteryHintParams);
        body.addView(batteryCard);

        return scroll(body);
    }

    private void addSwitchRow(LinearLayout parent, String title, String description, boolean checked) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        TextView titleView = text(title, 14, ink, true);
        TextView descriptionView = text(description, 11, muted, false);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        descriptionParams.topMargin = dp(3);
        labels.addView(titleView);
        labels.addView(descriptionView, descriptionParams);
        row.addView(labels, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Switch toggle = new Switch(this);
        toggle.setChecked(checked);
        toggle.setOnCheckedChangeListener((button, isChecked) -> {
            if (title.equals("Ringtone") && !isChecked) {
                stopPreviewRingtone();
            }
        });
        row.addView(toggle);
        parent.addView(row, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58)));
    }

    private void addDivider(LinearLayout parent) {
        View line = new View(this);
        line.setBackgroundColor(border);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        params.topMargin = dp(3);
        params.bottomMargin = dp(3);
        parent.addView(line, params);
    }


    private void ensureCallPermissionsForNotifications() {
        if (android.os.Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7302);
        }
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            android.app.NotificationManager manager = getSystemService(android.app.NotificationManager.class);
            if (manager != null && !manager.canUseFullScreenIntent()) {
                new AlertDialog.Builder(this)
                        .setTitle("Allow full-screen call alerts")
                        .setMessage("Family Call needs full-screen notification permission to show the incoming call screen when your phone is locked.")
                        .setPositiveButton("Open settings", (dialog, which) -> {
                            Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                            settings.setData(android.net.Uri.parse("package:" + getPackageName()));
                            startActivity(settings);
                        })
                        .setNegativeButton("Later", null)
                        .show();
            }
        }
    }

    private void showPairingDialog() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(8), dp(22), 0);

        TextView help = text("Choose who owns this phone. Enter the one-time family setup PIN. No account, password or QR scan is used.", 13, muted, false);
        form.addView(help);

        TextView deviceLabel = text("This device belongs to", 12, ink, true);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        labelParams.topMargin = dp(16);
        form.addView(deviceLabel, labelParams);

        Spinner deviceSpinner = new Spinner(this);
        String[] names = new String[]{"Ma — OPPO phone", "Juyel — Laptop", "Mim — Phone"};
        deviceSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
        form.addView(deviceSpinner, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

        TextView pinLabel = text("Private setup PIN", 12, ink, true);
        LinearLayout.LayoutParams pinLabelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pinLabelParams.topMargin = dp(10);
        form.addView(pinLabel, pinLabelParams);

        EditText pinInput = new EditText(this);
        pinInput.setSingleLine(true);
        pinInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pinInput.setHint("Enter setup PIN");
        form.addView(pinInput, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50)));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Set up Family Call")
                .setView(form)
                .setCancelable(false)
                .setPositiveButton("Pair device", null)
                .setNegativeButton("Close app", (d, which) -> finish())
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String pin = pinInput.getText().toString().trim();
            if (pin.length() < 6) {
                pinInput.setError("Enter the setup PIN");
                return;
            }
            String deviceId = deviceSpinner.getSelectedItemPosition() == 0 ? "ma"
                    : deviceSpinner.getSelectedItemPosition() == 2 ? "mim" : "juyel";
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);

            new Thread(() -> {
                try {
                    JSONObject body = new JSONObject();
                    body.put("deviceId", deviceId);
                    body.put("pin", pin);
                    JSONObject response = ApiClient.post("/api/pair", body, null);
                    String token = response.optString("deviceToken", "");
                    if (token.isEmpty()) throw new IllegalStateException("The server did not return a device token.");
                    DeviceSession.save(this, deviceId, token);
                    runOnUiThread(() -> {
                        dialog.dismiss();
                        renderApp();
                        PushRegistration.register(this);
                        ensureCallPermissionsForNotifications();
                        Toast.makeText(this, "This device is paired.", Toast.LENGTH_LONG).show();
                    });
                } catch (Exception error) {
                    runOnUiThread(() -> {
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                        String message = error.getMessage() == null ? "Pairing failed." : error.getMessage();
                        new AlertDialog.Builder(this)
                                .setTitle("Could not pair this device")
                                .setMessage(message)
                                .setPositiveButton("OK", null)
                                .show();
                    });
                }
            }).start();
        }));
        dialog.show();
    }

    private void startOutgoingCall(String targetDeviceId, String callType) {
        if (!DeviceSession.isPaired(this)) {
            showPairingDialog();
            return;
        }
        Intent intent = new Intent(this, CallSessionActivity.class);
        intent.putExtra(CallSessionActivity.EXTRA_TARGET_DEVICE, targetDeviceId);
        intent.putExtra(CallSessionActivity.EXTRA_CALL_TYPE, callType);
        startActivity(intent);
    }

    private void showCallNotConnected(String person, String type) {
        new AlertDialog.Builder(this)
                .setTitle(type.equals("video") ? "Video call not connected yet" : "Audio call not connected yet")
                .setMessage("The Android app screens are ready, but remote calls are not connected yet. The Vercel call-signaling and phone push setup must be added before " + person + " can be called.")
                .setPositiveButton("OK", null)
                .show();
    }

    private void stopPreviewRingtone() {
        if (previewRingtone != null) {
            if (previewRingtone.isPlaying()) previewRingtone.stop();
            previewRingtone = null;
        }
        handler.removeCallbacksAndMessages(null);
    }

    private void previewRingtone() {
        stopPreviewRingtone();
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        previewRingtone = RingtoneManager.getRingtone(this, uri);
        if (previewRingtone != null) {
            if (android.os.Build.VERSION.SDK_INT >= 28) previewRingtone.setLooping(true);
            previewRingtone.play();
            Ringtone playing = previewRingtone;
            handler.postDelayed(() -> {
                if (playing.isPlaying()) playing.stop();
                if (previewRingtone == playing) previewRingtone = null;
            }, 5000);
        } else {
            Toast.makeText(this, "No default ringtone is available.", Toast.LENGTH_SHORT).show();
        }
    }

    private LinearLayout pageColumn() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(20), dp(14), dp(20), dp(20));
        return column;
    }

    private ScrollView scroll(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.addView(child);
        return scroll;
    }

    private LinearLayout cardColumn() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackground(round(Color.WHITE, dp(18), border, dp(1)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(13);
        card.setLayoutParams(params);
        return card;
    }

    private TextView actionButton(String label, boolean filled) {
        TextView button = text(label, 12, filled ? Color.WHITE : teal, true);
        button.setGravity(Gravity.CENTER);
        button.setClickable(true);
        button.setFocusable(true);
        button.setBackground(round(filled ? teal : pale, dp(12),
                filled ? teal : border, dp(1)));
        return button;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setIncludeFontPadding(true);
        return view;
    }

    private GradientDrawable round(int color, int radius, int strokeColor, int strokeWidth) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        if (strokeWidth > 0) drawable.setStroke(strokeWidth, strokeColor);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
