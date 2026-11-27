import { NextResponse } from "next/server";
import { authenticateDevice, bearerToken } from "@/src/lib/device-auth";
import { redis } from "@/src/lib/redis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!redis) return NextResponse.json({ error: "Call storage is not configured." }, { status: 503 });
  const deviceId = await authenticateDevice(bearerToken(request));
  if (!deviceId) return NextResponse.json({ error: "This device is not enrolled." }, { status: 401 });

  let body: { fcmToken?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.fcmToken !== "string" || body.fcmToken.length < 30 || body.fcmToken.length > 4096) {
    return NextResponse.json({ error: "Invalid push token." }, { status: 400 });
  }

  await redis.set("family-call:fcm:" + deviceId, body.fcmToken, "EX", 60 * 60 * 24 * 180);
  return NextResponse.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
}
