import { describe, expect, it } from "vitest";
import { describeNow, freeSlots, weekdayOf } from "@/lib/availability";
import { demoClinic } from "@/lib/clinic";

// 2026-10-26 Pazartesi; klinik 09:00–18:00 açık, 30 dk aralıklarla.
const monday = "2026-10-26";
const sundayBefore = new Date("2026-10-25T09:00:00+03:00");

describe("freeSlots", () => {
  it("çalışma saatleri içinde, hizmet süresi sığacak şekilde saat üretir", () => {
    const slots = freeSlots({ clinic: demoClinic, date: monday, durationMinutes: 60, busy: [], now: sundayBefore });
    expect(slots[0]).toBe("2026-10-26T09:00:00+03:00");
    expect(slots.at(-1)).toBe("2026-10-26T17:00:00+03:00");
    expect(slots).toHaveLength(17);
  });

  it("dolu aralıklarla çakışan saatleri çıkarır", () => {
    const slots = freeSlots({
      clinic: demoClinic,
      date: monday,
      durationMinutes: 60,
      busy: [{ start: "2026-10-26T10:00:00+03:00", end: "2026-10-26T11:00:00+03:00" }],
      now: sundayBefore,
    });
    expect(slots).not.toContain("2026-10-26T09:30:00+03:00");
    expect(slots).not.toContain("2026-10-26T10:00:00+03:00");
    expect(slots).not.toContain("2026-10-26T10:30:00+03:00");
    expect(slots).toContain("2026-10-26T09:00:00+03:00");
    expect(slots).toContain("2026-10-26T11:00:00+03:00");
  });

  it("UTC olarak kaydedilmiş dolu aralıkları da doğru karşılaştırır", () => {
    const slots = freeSlots({
      clinic: demoClinic,
      date: monday,
      durationMinutes: 30,
      busy: [{ start: "2026-10-26T06:00:00.000Z", end: "2026-10-26T06:30:00.000Z" }], // 09:00 yerel
      now: sundayBefore,
    });
    expect(slots[0]).toBe("2026-10-26T09:30:00+03:00");
  });

  it("geçmiş saatleri ve kapalı günleri vermez", () => {
    const noon = new Date("2026-10-26T12:10:00+03:00");
    const slots = freeSlots({ clinic: demoClinic, date: monday, durationMinutes: 30, busy: [], now: noon });
    expect(slots[0]).toBe("2026-10-26T12:30:00+03:00");
    expect(freeSlots({ clinic: demoClinic, date: "2026-10-25", durationMinutes: 30, busy: [] })).toEqual([]);
  });

  it("geçersiz tarih formatında boş döner", () => {
    expect(freeSlots({ clinic: demoClinic, date: "26.10.2026", durationMinutes: 30, busy: [] })).toEqual([]);
  });
});

describe("tarih yardımcıları", () => {
  it("haftanın gününü saat diliminden bağımsız hesaplar", () => {
    expect(weekdayOf(monday)).toBe(1);
  });

  it("şu anı klinik yerel saatiyle anlatır", () => {
    expect(describeNow(demoClinic, new Date("2026-10-25T21:30:00Z"))).toBe(
      "2026-10-26 Pazartesi 00:30 (klinik yerel saati, UTC+03:00)",
    );
  });
});
