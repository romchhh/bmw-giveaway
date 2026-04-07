import { createHmac, timingSafeEqual } from "crypto";

export function validateTelegramWebAppInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getTelegramUserIdFromInitData(initData: string): number | null {
  const raw = new URLSearchParams(initData).get("user");
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as { id?: unknown };
    return typeof u.id === "number" ? u.id : null;
  } catch {
    return null;
  }
}
