import { describe, expect, it } from "vitest";
import { describeNow, freeSlots, weekdayOf } from "@/lib/availability";
import { barber } from "@/lib/businesses/barber";
import { dentalClinic } from "@/lib/businesses/dental-clinic";
import { hairSalon } from "@/lib/businesses/hair-salon";

// 2026-10-26 Pazartesi, 2026-10-28 Çarşamba.
const monday = "2026-10-26";
const wednesday = "2026-10-28";
const before = new Date("2026-10-25T09:00:00+03:00");
const starts = (slots: { start: string }[]) => slots.map((s) => s.start);

describe("freeSlots: çalışanı olmayan işletme (tek takvim)", () => {
  it("çalışma saatleri içinde, hizmet süresi sığacak şekilde saat üretir", () => {
    const slots = freeSlots({ business: dentalClinic, date: monday, serviceId: "implant", busy: [], now: before });
    expect(slots[0].start).toBe("2026-10-26T09:00:00+03:00");
    expect(slots.at(-1)!.start).toBe("2026-10-26T17:00:00+03:00");
    expect(slots).toHaveLength(17);
  });

  it("dolu aralıklarla çakışan saatleri çıkarır (UTC kayıtlar dahil)", () => {
    const slots = starts(
      freeSlots({
        business: dentalClinic,
        date: monday,
        serviceId: "implant",
        busy: [{ start: "2026-10-26T07:00:00.000Z", end: "2026-10-26T08:00:00.000Z" }], // 10:00–11:00 yerel
        now: before,
      }),
    );
    expect(slots).not.toContain("2026-10-26T09:30:00+03:00");
    expect(slots).not.toContain("2026-10-26T10:30:00+03:00");
    expect(slots).toContain("2026-10-26T09:00:00+03:00");
    expect(slots).toContain("2026-10-26T11:00:00+03:00");
  });

  it("geçmiş saatleri, kapalı günleri, bilinmeyen hizmeti ve bozuk tarihi vermez", () => {
    const noon = new Date("2026-10-26T12:10:00+03:00");
    expect(freeSlots({ business: dentalClinic, date: monday, serviceId: "muayene", busy: [], now: noon })[0].start).toBe(
      "2026-10-26T12:30:00+03:00",
    );
    expect(freeSlots({ business: dentalClinic, date: "2026-10-25", serviceId: "muayene", busy: [] })).toEqual([]);
    expect(freeSlots({ business: dentalClinic, date: monday, serviceId: "yok", busy: [] })).toEqual([]);
    expect(freeSlots({ business: dentalClinic, date: "26.10.2026", serviceId: "muayene", busy: [] })).toEqual([]);
  });
});

describe("freeSlots: çalışanlı işletme", () => {
  it("bir usta doluyken diğeri boşsa saat hâlâ verilir", () => {
    const busy = [{ start: "2026-10-26T10:00:00+03:00", end: "2026-10-26T10:30:00+03:00", staffId: "mehmet" }];
    const slot = freeSlots({ business: barber, date: monday, serviceId: "sac", busy, now: before }).find(
      (s) => s.start === "2026-10-26T10:00:00+03:00",
    );
    expect(slot?.staffIds).toEqual(["can"]);
  });

  it("belirli bir usta istenince sadece onun boş saatleri döner", () => {
    const busy = [{ start: "2026-10-26T10:00:00+03:00", end: "2026-10-26T10:30:00+03:00", staffId: "mehmet" }];
    const slots = starts(
      freeSlots({ business: barber, date: monday, serviceId: "sac", staffId: "mehmet", busy, now: before }),
    );
    expect(slots).not.toContain("2026-10-26T10:00:00+03:00");
    expect(slots).toContain("2026-10-26T10:30:00+03:00");
  });

  it("tüm ustalar doluysa saat verilmez", () => {
    const busy = ["mehmet", "can"].map((staffId) => ({
      start: "2026-10-26T10:00:00+03:00",
      end: "2026-10-26T10:30:00+03:00",
      staffId,
    }));
    expect(starts(freeSlots({ business: barber, date: monday, serviceId: "sac", busy, now: before }))).not.toContain(
      "2026-10-26T10:00:00+03:00",
    );
  });

  it("sadece hizmeti yapabilen çalışanları önerir", () => {
    // Röfleyi Elif ve Selin yapar, Deniz yapmaz.
    const slots = freeSlots({ business: hairSalon, date: wednesday, serviceId: "rofle", busy: [], now: before });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !s.staffIds.includes("deniz"))).toBe(true);
  });

  it("çalışanın kendi çalışma saatlerine uyar", () => {
    // Selin Çarşamba 12:00'de başlar, Salı çalışmaz.
    const slots = freeSlots({
      business: hairSalon,
      date: wednesday,
      serviceId: "fon",
      staffId: "selin",
      busy: [],
      now: before,
    });
    expect(slots[0].start).toBe("2026-10-28T12:00:00+03:00");
    expect(
      freeSlots({ business: hairSalon, date: "2026-10-27", serviceId: "fon", staffId: "selin", busy: [], now: before }),
    ).toEqual([]);
  });
});

describe("tarih yardımcıları", () => {
  it("haftanın gününü saat diliminden bağımsız hesaplar", () => {
    expect(weekdayOf(monday)).toBe(1);
  });

  it("şu anı işletmenin yerel saatiyle anlatır", () => {
    expect(describeNow(barber, new Date("2026-10-25T21:30:00Z"))).toBe(
      "2026-10-26 Pazartesi 00:30 (işletmenin yerel saati, UTC+03:00)",
    );
  });
});
