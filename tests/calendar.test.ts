import { describe, expect, it } from "vitest";
import { cardToEvent, googleCalendarUrl, toIcs, type AppointmentCard } from "@/lib/calendar";
import { buildInteractive } from "@/lib/whatsapp";

const card: AppointmentCard = {
  id: "11111111-2222-3333-4444-555555555555",
  businessName: "Ustura Berber",
  serviceName: "Saç + sakal",
  staffName: "Mehmet Usta",
  customerName: "Ali",
  start: "2026-10-26T18:00:00+03:00",
  end: "2026-10-26T18:45:00+03:00",
  priceInfo: "550 TL",
  address: "Tunalı Hilmi Cad. No:5, Çankaya / Ankara",
};

describe("takvim", () => {
  it("Google Takvim bağlantısı UTC saatleri ve bilgileri içerir", () => {
    const url = new URL(googleCalendarUrl(card));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261026T150000Z/20261026T154500Z");
    expect(url.searchParams.get("text")).toBe("Saç + sakal · Ustura Berber");
    expect(url.searchParams.get("details")).toContain("Mehmet Usta");
    expect(url.searchParams.get("location")).toBe(card.address);
  });

  it("ICS dosyası RFC 5545'e uygun: CRLF, kaçış ve 75 baytlık katlama", () => {
    const ics = toIcs("Ustura Berber", [cardToEvent(card)], new Date("2026-10-25T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261026T150000Z");
    expect(ics).toContain("DTEND:20261026T154500Z");
    expect(ics).toContain("UID:11111111-2222-3333-4444-555555555555@randevu-asistani");
    // Virgül kaçışlı, uzun satır katlanmış (devam satırı boşlukla başlar)
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("LOCATION:Tunalı Hilmi Cad. No:5\\, Çankaya / Ankara");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("WhatsApp etkileşimli mesaj", () => {
  it("en fazla 3 kısa seçeneği düğme yapar", () => {
    const m = buildInteractive("Hangisi?", ["Evet", "Hayır"]) as { type: string; action: { buttons: unknown[] } };
    expect(m.type).toBe("button");
    expect(m.action.buttons).toEqual([
      { type: "reply", reply: { id: "opt_0", title: "Evet" } },
      { type: "reply", reply: { id: "opt_1", title: "Hayır" } },
    ]);
  });

  it("çok veya uzun seçenekleri listeye çevirir, gövdeyi sınırlar", () => {
    const options = ["Salı 14:00", "Salı 14:30", "Salı 15:00", "Salı 15:30"];
    const m = buildInteractive("x".repeat(2000), options) as {
      type: string;
      body: { text: string };
      action: { sections: { rows: { title: string }[] }[] };
    };
    expect(m.type).toBe("list");
    expect(m.body.text).toHaveLength(1024);
    expect(m.action.sections[0].rows.map((r) => r.title)).toEqual(options);
    expect((buildInteractive("x", ["Bu seçenek yirmi karakterden uzun"]) as { type: string }).type).toBe("list");
  });
});
