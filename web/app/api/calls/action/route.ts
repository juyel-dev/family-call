import { NextResponse } from "next/server";
import { authenticateDevice, bearerToken } from "@/src/lib/device-auth";
import { redis, SIGNAL_CHANNEL, isDeviceId } from "@/src/lib/redis";

export const runtime = "nodejs";

type CallRecord = { callerId: string; calleeId: string; callType: "audio" | "video"; state: string; createdAt: number };

export async function POST(request: Request) {
  if (!redis) return NextResponse.json({ error: "Call storage is not configured." }, { status: 503 });
  const deviceId = await authenticateDevice(bearerToken(request));
  if (!deviceId) return NextResponse.json({ error: "This device is not enrolled." }, { status: 401 });

  let body: { callId?: unknown; action?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.callId !== "string" || !/^[a-f0-9-]{20,50}$/i.test(body.callId) || !["accept", "reject", "end"].includes(String(body.action))) {
    return NextResponse.json({ error: "Invalid call action." }, { status: 400 });
  }

  const key = "family-call:call:" + body.callId;
  const raw = await redis.get(key);
  if (!raw) return NextResponse.json({ error: "This call has expired." }, { status: 404 });
  let call: CallRecord;
  try { call = JSON.parse(raw) as CallRecord; } catch {
    return NextResponse.json({ error: "Call state is invalid." }, { status: 500 });
  }
  if (deviceId !== call.callerId && deviceId !== call.calleeId) {
    return NextResponse.json({ error: "This device is not part of the call." }, { status: 403 });
  }

  const action = body.action;
  const targetDeviceId = deviceId === call.callerId ? call.calleeId : call.callerId;
  const eventType = action === "accept" ? "call:accepted" : action === "reject" ? "call:rejected" : "call:ended";
  call.state = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "ended";
  if (action !== "accept") await redis.set(key, JSON.stringify(call), "EX", 15);
  else await redis.set(key, JSON.stringify(call), "EX", 180);

  await redis.publish(SIGNAL_CHANNEL, JSON.stringify({
    targetDeviceId,
    event: { type: eventType, callId: body.callId, fromDeviceId: deviceId, callType: call.callType },
  }));
  return NextResponse.json({ ok: true, state: call.state }, { headers: { "Cache-Control": "no-store" } });
}
