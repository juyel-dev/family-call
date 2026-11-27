import { GoogleAuth } from "google-auth-library";

type FcmPayload = {
  token: string;
  callId: string;
  callerName: string;
  callType: "audio" | "video";
  callerDeviceId: string;
};

let authClient: GoogleAuth | null = null;

function firebaseCredentials(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    console.error("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    return null;
  }
}

export async function sendIncomingCallPush(payload: FcmPayload): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const credentials = firebaseCredentials();
  if (!projectId || !credentials) {
    console.warn("[fcm] Push is not configured. Incoming push was not sent.");
    return false;
  }

  try {
    if (!authClient) {
      authClient = new GoogleAuth({
        credentials: credentials as { client_email: string; private_key: string },
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      });
    }
    const client = await authClient.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken.token) throw new Error("Google OAuth did not return an access token.");

    const response = await fetch(
      "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: payload.token,
            data: {
              type: "incoming_call",
              callId: payload.callId,
              callerName: payload.callerName,
              callerDeviceId: payload.callerDeviceId,
              callType: payload.callType,
            },
            android: { priority: "HIGH", ttl: "45s" },
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("[fcm] send failed", response.status, detail.slice(0, 800));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[fcm] send failed", error);
    return false;
  }
}
