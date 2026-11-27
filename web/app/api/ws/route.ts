import { upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import type { WebSocket } from "ws";
import { authenticateDevice } from "@/src/lib/device-auth";
import { sendIncomingCallPush } from "@/src/lib/fcm";
import { DEVICE_IDS, isDeviceId, redis, SIGNAL_CHANNEL, type DeviceId, getSubscriber } from "@/src/lib/redis";

export const runtime = "nodejs";

type CallRecord = {
  callerId: DeviceId;
  calleeId: DeviceId;
  callType: "audio" | "video";
  state: "ringing" | "accepted" | "rejected" | "ended";
  createdAt: number;
};

type LocalConnection = { deviceId: DeviceId; connectionId: string };
type Envelope = { targetDeviceId: DeviceId; event: Record<string, unknown>; origin: string };

const globalHub = globalThis as typeof globalThis & {
  __familyCallConnections?: Map<WebSocket, LocalConnection>;
  __familyCallSubscriberReady?: boolean;
  __familyCallInstanceId?: string;
};

const connections = globalHub.__familyCallConnections ?? (globalHub.__familyCallConnections = new Map());
const instanceId = globalHub.__familyCallInstanceId ?? (globalHub.__familyCallInstanceId = crypto.randomUUID());

function send(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(payload)); } catch (error) { console.error("[family-call] socket send failed", error); }
  }
}

function broadcastLocal(targetDeviceId: DeviceId, event: Record<string, unknown>) {
  for (const [socket, connection] of connections) {
    if (connection.deviceId === targetDeviceId) send(socket, event);
  }
}

async function ensureSubscription() {
  const subscriber = getSubscriber();
  if (!subscriber || globalHub.__familyCallSubscriberReady) return;
  subscriber.on("message", (channel, raw) => {
    if (channel !== SIGNAL_CHANNEL) return;
    try {
      const envelope = JSON.parse(raw) as Envelope;
      if (envelope.origin !== instanceId && isDeviceId(envelope.targetDeviceId)) {
        broadcastLocal(envelope.targetDeviceId, envelope.event);
      }
    } catch (error) {
      console.error("[family-call] invalid Redis signal envelope", error);
    }
  });
  await subscriber.subscribe(SIGNAL_CHANNEL);
  globalHub.__familyCallSubscriberReady = true;
}

async function publishToDevice(targetDeviceId: DeviceId, event: Record<string, unknown>) {
  broadcastLocal(targetDeviceId, event);
  if (!redis) return;
  const envelope: Envelope = { targetDeviceId, event, origin: instanceId };
  await redis.publish(SIGNAL_CHANNEL, JSON.stringify(envelope));
}

async function pushPresence() {
  if (!redis) return;
  const now = Date.now();
  const ids = await redis.mget(...DEVICE_IDS.map((id) => "family-call:presence:" + id));
  const online = DEVICE_IDS.filter((id, index) => Boolean(ids[index]));
  for (const id of DEVICE_IDS) {
    await publishToDevice(id, { type: "presence", online, at: now });
  }
}

async function getCall(callId: string): Promise<CallRecord | null> {
  if (!redis) return null;
  const raw = await redis.get("family-call:call:" + callId);
  if (!raw) return null;
  try { return JSON.parse(raw) as CallRecord; } catch { return null; }
}

async function handleMessage(ws: WebSocket, raw: WebSocketData) {
  const connection = connections.get(ws);
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    send(ws, { type: "error", message: "Invalid message format." });
    return;
  }

  if (!connection) {
    if (message.type !== "authenticate" || typeof message.token !== "string") {
      send(ws, { type: "error", message: "Authenticate this device before sending call events." });
      ws.close(1008, "Authentication required");
      return;
    }
    const deviceId = await authenticateDevice(message.token);
    if (!deviceId || !isDeviceId(deviceId)) {
      send(ws, { type: "error", message: "This device is not enrolled." });
      ws.close(1008, "Not enrolled");
      return;
    }
    const connectionId = crypto.randomUUID();
    connections.set(ws, { deviceId, connectionId });
    await redis!.set("family-call:presence:" + deviceId, connectionId, "EX", 50);
    send(ws, { type: "authenticated", deviceId });
    await pushPresence();
    return;
  }

  const { deviceId, connectionId } = connection;
  if (!redis) {
    send(ws, { type: "error", message: "Call storage is not configured." });
    return;
  }

  switch (message.type) {
    case "heartbeat": {
      await redis.set("family-call:presence:" + deviceId, connectionId, "EX", 50);
      await pushPresence();
      return;
    }

    case "call:start": {
      const target = message.toDeviceId;
      const callType = message.callType === "video" ? "video" : "audio";
      if (!isDeviceId(target) || target === deviceId) {
        send(ws, { type: "error", message: "Choose another family member." });
        return;
      }

      const callId = crypto.randomUUID();
      const call: CallRecord = {
        callerId: deviceId,
        calleeId: target,
        callType,
        state: "ringing",
        createdAt: Date.now(),
      };
      const created = await redis.set("family-call:call:" + callId, JSON.stringify(call), "EX", 75, "NX");
      if (created !== "OK") {
        send(ws, { type: "error", message: "Could not create the call. Try again." });
        return;
      }

      send(ws, { type: "call:outgoing", callId, toDeviceId: target, callType });
      await publishToDevice(target, { type: "call:incoming", callId, fromDeviceId: deviceId, callType });
      const fcmToken = await redis.get("family-call:fcm:" + target);
      if (fcmToken) {
        await sendIncomingCallPush({
          token: fcmToken,
          callId,
          callerName: deviceId === "ma" ? "Ma" : deviceId === "mim" ? "Mim" : "Juyel",
          callerDeviceId: deviceId,
          callType,
        });
      }
      return;
    }

    case "call:accept":
    case "call:reject":
    case "call:cancel":
    case "call:end": {
      if (typeof message.callId !== "string") return;
      const call = await getCall(message.callId);
      if (!call || (call.callerId !== deviceId && call.calleeId !== deviceId)) {
        send(ws, { type: "error", message: "This call is no longer available." });
        return;
      }
      const target = call.callerId === deviceId ? call.calleeId : call.callerId;
      const action = String(message.type);
      const eventType = action === "call:accept" ? "call:accepted"
        : action === "call:reject" ? "call:rejected" : "call:ended";

      call.state = action === "call:accept" ? "accepted" : action === "call:reject" ? "rejected" : "ended";
      await redis.set("family-call:call:" + message.callId, JSON.stringify(call), "EX", call.state === "accepted" ? 180 : 15);
      await publishToDevice(target, { type: eventType, callId: message.callId, fromDeviceId: deviceId, callType: call.callType });
      if (action === "call:accept") {
        send(ws, { type: "call:accepted", callId: message.callId, fromDeviceId: deviceId, callType: call.callType });
      }
      if (action === "call:reject") send(ws, { type: "call:rejected", callId: message.callId });
      if (action === "call:cancel" || action === "call:end") send(ws, { type: "call:ended", callId: message.callId });
      return;
    }

    case "call:join": {
      if (typeof message.callId !== "string") return;
      const call = await getCall(message.callId);
      if (!call || call.state !== "accepted" || (call.callerId !== deviceId && call.calleeId !== deviceId)) {
        send(ws, { type: "error", message: "This call is not ready to connect." });
        return;
      }
      const joinKey = "family-call:joined:" + message.callId;
      await redis.sadd(joinKey, deviceId);
      await redis.expire(joinKey, 180);
      const joinedCount = await redis.scard(joinKey);
      send(ws, { type: "call:joined", callId: message.callId, role: call.callerId === deviceId ? "caller" : "callee", callType: call.callType });
      if (joinedCount >= 2) {
        await publishToDevice(call.callerId, { type: "call:peer-ready", callId: message.callId });
        await publishToDevice(call.calleeId, { type: "call:peer-ready", callId: message.callId });
      }
      return;
    }

    case "call:signal": {
      if (typeof message.callId !== "string" || !message.signal || typeof message.signal !== "object") return;
      const call = await getCall(message.callId);
      if (!call || call.state !== "accepted" || (call.callerId !== deviceId && call.calleeId !== deviceId)) return;
      const signal = message.signal as Record<string, unknown>;
      if (!["offer", "answer", "candidate"].includes(String(signal.kind)) || !signal.value) return;
      const target = call.callerId === deviceId ? call.calleeId : call.callerId;
      await publishToDevice(target, {
        type: "call:signal",
        callId: message.callId,
        fromDeviceId: deviceId,
        signal: { kind: signal.kind, value: signal.value },
      });
      return;
    }

    default:
      send(ws, { type: "error", message: "Unknown call event." });
  }
}

export async function GET() {
  return upgradeWebSocket((ws) => {
    void ensureSubscription().catch((error) => {
      console.error("[family-call] Redis subscription failed", error);
      send(ws, { type: "error", message: "Signaling storage is unavailable." });
    });

    ws.on("message", (data: WebSocketData) => {
      void handleMessage(ws, data).catch((error) => {
        console.error("[family-call] message handler failed", error);
        send(ws, { type: "error", message: "A call signaling error occurred." });
      });
    });

    ws.on("close", () => {
      void (async () => {
        const connection = connections.get(ws);
        if (!connection || !redis) return;
        connections.delete(ws);
        const key = "family-call:presence:" + connection.deviceId;
        const current = await redis.get(key);
        if (current === connection.connectionId) await redis.del(key);
        await pushPresence();
      })().catch((error) => console.error("[family-call] close cleanup failed", error));
    });

    ws.on("error", (error) => console.error("[family-call] WebSocket error", error));
  }, { maxPayload: 128 * 1024 });
}
