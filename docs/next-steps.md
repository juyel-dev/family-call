# Family Call — Real Calling Plan

## Current milestone

- Native Android UI and a local incoming-call preview are in the repository.
- The laptop web app UI is being added.
- Neither client is connected to a remote call service yet.

## Proposed minimal architecture

1. **Vercel** hosts the laptop web app, HTTP API, and WebSocket signaling endpoint.
2. **WebRTC** carries audio/video directly between the two devices where the network allows it.
3. **Upstash Redis through Vercel Marketplace** stores short-lived call state and routes signaling between Vercel Function instances. Vercel WebSocket connections are pinned to an instance, but separate clients are not guaranteed to reach the same instance.
4. **Firebase Cloud Messaging (FCM)** wakes the Android app when it is backgrounded or the phone is locked. The app then displays Android's native incoming-call UI and plays the ringtone.
5. **STUN/TURN** is needed for network traversal; a TURN relay may be necessary on some mobile or restrictive networks.

## Privacy and no-login requirement

There is no public signup or normal account login. However, the GitHub repository is public, so a shared API key must never be embedded in the APK or frontend. To keep the service private, each approved installation needs a one-time device enrollment/provisioning step that issues a unique device credential. It does not need to be a username/password login or a QR scan; a short setup code can be typed once.

## Required setup before real calls

- Provision the Upstash Redis integration for the Vercel family-call project and provide its environment variables.
- Create a Firebase project and register the Android application ID com.juyel.familycall.
- Add the Firebase Android configuration and a server-side FCM credential; keep server credentials only in Vercel environment variables, never in GitHub.
- Enroll the three family devices once and register their push tokens.
- Add the WebRTC client to the Android app and web app, then test audio/video and call lifecycle on real devices.

## Reliability notes

- Vercel Hobby Function maximum duration is finite. Signaling sockets must reconnect safely; WebRTC media is peer-to-peer after negotiation, but signaling is still needed for call state and ICE restarts.
- Push delivery and ringing are best-effort over the network and Android power-management policy. Exact incoming-call behavior must be tested on the OPPO device with its battery/background settings.
- A TURN service may be required for reliable calls across mobile networks and restrictive NATs.
