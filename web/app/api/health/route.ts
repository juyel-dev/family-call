import { NextResponse } from "next/server";
import { redis } from "@/src/lib/redis";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    signalingConfigured: Boolean(redis),
    pushConfigured: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    enrollmentEnabled: Boolean(process.env.FAMILY_SETUP_PIN),
  }, { headers: { "Cache-Control": "no-store" } });
}
