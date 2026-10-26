import { afterEach, describe, expect, it, vi } from "vitest";
import { feedToken, isValidFeedToken } from "@/lib/calendar-feed";
import { addDays, isDate, localDate, localMinutes, mondayOf, weekDays } from "@/lib/week";

afterEach(() => vi.unstubAllEnvs());

describe("hafta yardımcıları", () => {
  it("yerel günü ve dakikayı işletme saat dilimine göre hesaplar", () => {
    // 21:30 UTC = ertesi gün 00:30 İstanbul
    expect(localDate("2026-10-25T21:30:00Z", "+03:00")).toBe("2026-10-26");
    expect(localMinutes("2026-10-25T21:30:00Z", "+03:00")).toBe(30);
    expect(localMinutes("2026-10-26T18:00:00+03:00", "+03:00")).toBe(18 * 60);
  });

  it("haftanın Pazartesi'sini bulur; Pazar önceki haftaya aittir", () => {
    expect(mondayOf("2026-10-28")).toBe("2026-10-26"); // Çarşamba
    expect(mondayOf("2026-10-26")).toBe("2026-10-26"); // Pazartesi
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // Pazar
    expect(weekDays("2026-10-26")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("geçersiz tarihi reddeder", () => {
    expect(isDate("2026-10-26")).toBe(true);
    expect(isDate("26.10.2026")).toBe(false);
    expect(isDate(undefined)).toBe(false);
    expect(isDate(["2026-10-26"])).toBe(false);
  });
});

describe("takvim abonelik anahtarı", () => {
  it("işletmeye özel, panel şifresine bağlı ve doğrulanabilir", () => {
    vi.stubEnv("PANEL_PASSWORD", "sifre-1");
    const token = feedToken("demo-berber");
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(isValidFeedToken("demo-berber", token)).toBe(true);
    expect(isValidFeedToken("demo-kuafor", token)).toBe(false);
    expect(isValidFeedToken("demo-berber", "kisa")).toBe(false);

    vi.stubEnv("PANEL_PASSWORD", "sifre-2");
    expect(isValidFeedToken("demo-berber", token)).toBe(false);
  });
});
