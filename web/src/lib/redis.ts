import Redis from "ioredis";

const globalForRedis = globalThis as typeof globalThis & {
  familyCallRedis?: Redis | null;
  familyCallSubscriber?: Redis | null;
};

function createRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 250, 5000),
  });
}

export const redis = globalForRedis.familyCallRedis ?? (globalForRedis.familyCallRedis = createRedis());

export function getSubscriber(): Redis | null {
  if (!redis) return null;
  if (!globalForRedis.familyCallSubscriber) {
    globalForRedis.familyCallSubscriber = redis.duplicate({
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 250, 5000),
    });
  }
  return globalForRedis.familyCallSubscriber;
}

export const SIGNAL_CHANNEL = "family-call:signals";
export const DEVICE_IDS = ["ma", "juyel", "mim"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

export function isDeviceId(value: unknown): value is DeviceId {
  return typeof value === "string" && (DEVICE_IDS as readonly string[]).includes(value);
}
