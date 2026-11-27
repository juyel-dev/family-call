# Family Call

A small private-family calling app starter for three predefined people: Ma, Juyel, and Mim.

## Android app

- Native Android app written in Java.
- Bottom navigation: **Missed Call | Call | Setting**.
- Call screen shows Mim and Juyel, each with Audio Call and Video Call actions.
- Native full-screen incoming-call UI and ringtone preview can be tested from **Setting**.
- No login, signup, password, or QR scan screens.
- No microphone, camera, GPS, or continuous polling while idle.

## Build APK

GitHub Actions builds a debug APK on pushes to `main`, pull requests, and manual workflow dispatch.

1. Open the repository's **Actions** tab.
2. Open **Android APK**.
3. Download the `family-call-debug-apk` artifact.
4. Extract the ZIP and install `app-debug.apk` on an Android phone.

## Important: current scope

This first milestone is the native Android UI and a **local incoming-call preview**. The Audio Call and Video Call buttons currently explain that remote calling is not connected yet.

A real call between the laptop and phones still requires:
- A Vercel-hosted call-signaling endpoint.
- A push-delivery path to wake Android when the app is backgrounded (normally Firebase Cloud Messaging).
- WebRTC audio/video transport and STUN/TURN configuration.

The app does not claim to place or receive remote calls until those services are implemented and configured.
