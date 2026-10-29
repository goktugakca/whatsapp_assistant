import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSessionToken, readSessionToken, SESSION_COOKIE } from "@/lib/session";
import { InMemoryStore } from "@/lib/store";

// next/headers'ı test içinde taklit ediyoruz: getSession çerezi buradan okur.
const cookieJar = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const store = new InMemoryStore();
vi.mock("@/lib/store", async (original) => ({
  ...(await original<typeof import("@/lib/store")>()),
  getStore: async () => store,
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PANEL_PASSWORD", "yonetici-sifresi");
  cookieJar.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("şifreler", () => {
  it("özet doğru şifreyi kabul eder, yanlışı reddeder; her seferinde farklı tuz", async () => {
    const hash = await hashPassword("cok-gizli-sifre");
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPassword("cok-gizli-sifre", hash)).toBe(true);
    expect(await verifyPassword("yanlis-sifre", hash)).toBe(false);
    expect(await hashPassword("cok-gizli-sifre")).not.toBe(hash);
    expect(await verifyPassword("x", "bozuk")).toBe(false);
  });
});

describe("oturum çerezi", () => {
  it("imzalı oturumu okur; değiştirilmiş, süresi dolmuş veya başka anahtarla imzalanmışı reddeder", () => {
    const token = createSessionToken({ sub: "u1", name: "ali", businessId: "demo-berber" });
    expect(readSessionToken(token)).toMatchObject({ sub: "u1", businessId: "demo-berber" });

    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", name: "admin", businessId: null, exp: 9e9 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.xx`)).toBeNull();
    expect(readSessionToken(token, Date.now() + 8 * 86400_000)).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();

    vi.stubEnv("PANEL_PASSWORD", "baska-sifre");
    expect(readSessionToken(token)).toBeNull();
  });

  it("production'da anahtar yoksa oturum oluşturmaz", () => {
    vi.stubEnv("PANEL_PASSWORD", "");
    expect(() => createSessionToken({ sub: "admin", name: "admin", businessId: null })).toThrow();
  });
});

describe("yetki katmanı", () => {
  async function loginAs(businessId: string | null) {
    if (businessId === null) {
      cookieJar.set(SESSION_COOKIE, createSessionToken({ sub: "admin", name: "admin", businessId: null }));
      return;
    }
    const user = await store.createPanelUser({
      username: `u-${businessId}-${Math.random()}`,
      passwordHash: "x",
      businessId,
    });
    cookieJar.set(SESSION_COOKIE, createSessionToken({ sub: user!.id, name: user!.username, businessId }));
    return user!;
  }

  it("işletme kullanıcısı sadece kendi işletmesine erişir", async () => {
    const { assertBusinessAccess, resolvePanelBusiness, requireAdmin } = await import("@/lib/dal");
    await loginAs("demo-berber");
    await expect(assertBusinessAccess("demo-berber")).resolves.toMatchObject({ isAdmin: false });
    await expect(assertBusinessAccess("demo-kuafor")).rejects.toThrow("Yetkisiz");
    expect((await resolvePanelBusiness("demo-kuafor")).businessId).toBe("demo-berber");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /panel");
  });

  it("yönetici tüm işletmelere erişir ve istediğini seçer", async () => {
    const { assertBusinessAccess, resolvePanelBusiness } = await import("@/lib/dal");
    await loginAs(null);
    await expect(assertBusinessAccess("demo-kuafor")).resolves.toMatchObject({ isAdmin: true });
    expect((await resolvePanelBusiness("demo-tirnak")).businessId).toBe("demo-tirnak");
    expect((await resolvePanelBusiness(undefined)).businessId).toBe("demo-kuafor");
    await expect(resolvePanelBusiness("olmayan")).rejects.toThrow(); // notFound()
  });

  it("silinen kullanıcının oturumu geçersizdir; girişsiz kullanıcı yönlendirilir", async () => {
    const { assertBusinessAccess, requireSession } = await import("@/lib/dal");
    const user = await loginAs("demo-berber");
    await store.deletePanelUser(user!.id);
    await expect(assertBusinessAccess("demo-berber")).rejects.toThrow("Yetkisiz");

    cookieJar.clear();
    await expect(requireSession()).rejects.toThrow("REDIRECT /giris");
  });

  it("çerezdeki işletme kullanıcı kaydıyla uyuşmuyorsa reddeder", async () => {
    const { assertBusinessAccess } = await import("@/lib/dal");
    const user = await loginAs("demo-berber");
    cookieJar.set(SESSION_COOKIE, createSessionToken({ sub: user!.id, name: "x", businessId: "demo-kuafor" }));
    await expect(assertBusinessAccess("demo-kuafor")).rejects.toThrow("Yetkisiz");
  });
});
