import { timingSafeEqual } from "node:crypto";

// Panel parolası kontrolü. Hem proxy.ts hem de server action'lar kullanır: server action'lar
// herhangi bir sayfa adresine POST edilebildiği için sadece proxy'ye güvenilmez.
export function isPanelAuthorized(authorizationHeader: string | null): boolean {
  const password = process.env.PANEL_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production";
  if (!authorizationHeader?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString("utf8");
  const supplied = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const expected = Buffer.from(password);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
