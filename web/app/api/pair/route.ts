import { NextResponse } from "next/server";
import { newDeviceToken } from "@/src/lib/device-auth";
import { DEVICE_IDS, isDeviceId, redis } from "@/src/lib/redis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!redis) return NextResponse.json({ error: "Call storage is not configured yet." }, { status: 503 });

  const configuredPin = process.env.FAMILY_SETUP_PIN;
  if (!configuredPin) return NextResponse.json({ error: "Device setup is not enabled yet." }, { status: 503 });

  let body: { deviceId?: unknown; pin?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid setup request." }, { status: 400 });
  }

  if (!isDeviceId(body.deviceId) || typeof body.pin !== "string") {
    return NextResponse.json({ error: "Choose one of the three family devices and enter the setup PIN." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const attemptsKey = "family-call:pair-attempts:" + ip;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 60);
  if (attempts > 10) return NextResponse.json({ error: "Too many setup attempts. Try again in one minute." }, { status: 429 });

  const pinMatches = Buffer.byteLength(body.pin) === Buffer.byteLength(configuredPin)
    && (await import("@/src/lib/device-auth")).constantTimeEqual(body.pin, configuredPin);
  if (!pinMatches) return NextResponse.json({ error: "That setup PIN is not correct." }, { status: 403 });

  const deviceId = body.deviceId;
  const existing = await redis.get("family-call:paired:" + deviceId);
  if (existing) return NextResponse.json({ error: "This device name has already been paired. Ask the owner to reset its pairing before enrolling it again." }, { status: 409 });

  const deviceToken = newDeviceToken();
  const transaction = redis.multi();
  transaction.set("family-call:paired:" + deviceId, "1", "EX", 31536000, "NX");
  transaction.set("family-call:device-token:" + (await import("@/src/lib/device-auth")).hashDeviceToken(deviceToken), deviceId, "EX", 31536000);
  const result = await transaction.exec();
  if (!result || result[0]?.[0] || result[0]?.[1] !== "OK") {
    await redis.del("family-call:device-token:" + (await import("@/src/lib/device-auth")).hashDeviceToken(deviceToken));
    return NextResponse.json({ error: "This device has already been paired. Ask the owner to reset it." }, { status: 409 });
  }

  await redis.del(attemptsKey);
  return NextResponse.json({
    deviceToken,
    deviceId,
    deviceName: deviceId === "ma" ? "Ma" : deviceId === "mim" ? "Mim" : "Juyel",
  }, { headers: { "Cache-Control": "no-store" } });
}
