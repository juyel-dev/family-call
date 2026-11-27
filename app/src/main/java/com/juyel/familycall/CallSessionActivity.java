package com.juyel.familycall;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class CallSessionActivity extends Activity {
    public static final String EXTRA_CALL_ID = "call_id";
    public static final String EXTRA_CALLER_NAME = "caller_name";
    public static final String EXTRA_CALL_TYPE = "call_type";
    public static final String EXTRA_TARGET_DEVICE = "target_device";

    private WebView webView;
    private PermissionRequest pendingWebPermission;
    private String callType = "audio";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN);

        Intent intent = getIntent();
        callType = intent.getStringExtra(EXTRA_CALL_TYPE);
        if (!"video".equals(callType)) callType = "audio";

        List<String> required = new ArrayList<>();
        required.add(Manifest.permission.RECORD_AUDIO);
        if ("video".equals(callType)) required.add(Manifest.permission.CAMERA);

        List<String> missing = new ArrayList<>();
        for (String permission : required) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) missing.add(permission);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), 7301);
            return;
        }
        openCallPage();
    }

    private void openCallPage() {
        String token = DeviceSession.token(this);
        String deviceId = DeviceSession.deviceId(this);
        if (token.isEmpty() || deviceId.isEmpty()) {
            Toast.makeText(this, "Set up this device before calling.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF101C2A);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= 26) webView.getSettings().setSafeBrowsingEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean allowed = true;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) allowed = false;
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                                && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) allowed = false;
                    }
                    if (allowed) request.grant(request.getResources());
                    else {
                        pendingWebPermission = request;
                        Toast.makeText(CallSessionActivity.this, "Allow microphone and camera access to use calls.", Toast.LENGTH_LONG).show();
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }
        });

        setContentView(webView);

        String callId = getIntent().getStringExtra(EXTRA_CALL_ID);
        String target = getIntent().getStringExtra(EXTRA_TARGET_DEVICE);
        String role = callId == null || callId.isEmpty() ? "outgoing" : "callee";
        StringBuilder url = new StringBuilder(ApiClient.BASE_URL).append("/call?");
        if (callId != null && !callId.isEmpty()) {
            url.append("callId=").append(encode(callId)).append("&role=callee");
        } else if (target != null) {
            url.append("to=").append(encode(target)).append("&role=outgoing");
        }
        url.append("&type=").append(encode(callType));
        url.append("#deviceToken=").append(encode(token)).append("&deviceId=").append(encode(deviceId));
        webView.loadUrl(url.toString());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != 7301) return;
        boolean granted = grantResults.length > 0;
        for (int result : grantResults) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) openCallPage();
        else {
            Toast.makeText(this, "Microphone and camera permission are required for calls.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private String encode(String value) {
        try { return URLEncoder.encode(value, StandardCharsets.UTF_8.name()); }
        catch (Exception ignored) { return ""; }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
