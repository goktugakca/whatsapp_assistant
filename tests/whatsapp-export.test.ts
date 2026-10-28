import { describe, expect, it } from "vitest";
import { extractExamples, extractPrice, guessSalonSenders, parseExport, redact } from "@/lib/whatsapp-export";

const IOS = `‎[20.09.2026 21:14:05] Nil Saç Atölyesi: ‎Mesajlar ve aramalar uçtan uca şifrelidir.
[20.09.2026 21:14:05] Ayşe Yılmaz: Merhaba, balyaj yaptırmak istiyorum
‎[20.09.2026 21:14:30] Ayşe Yılmaz: ‎<ekli: 00000012-PHOTO-2026-09-20-21-14-30.jpg>
‎[20.09.2026 21:14:41] Ayşe Yılmaz: ‎<ekli: 00000013-PHOTO-2026-09-20-21-14-41.jpg>
[20.09.2026 21:15:02] Ayşe Yılmaz: Saçım bu şekilde, ne kadar olur?
[21.09.2026 09:40:11] Nil Saç Atölyesi: Günaydın Ayşe Hanım! Saçınız uzun, balyaj 5.000 TL olur.
Cuma 14:00 uygun mu? Numaramız 0532 123 45 67
[21.09.2026 09:45:00] Ayşe Yılmaz: Tamam olur`;

const ANDROID = `20.09.2026 18:02 - Nil Saç Atölyesi: Merhaba
20.09.2026 18:03 - +90 555 111 22 33: IMG-20260920-WA0003.jpg (dosya ekli)
dip boya ne kadar
20.09.2026 18:30 - Nil Saç Atölyesi: dibiniz 3 parmak kadar, 1.800₺
20.09.2026 18:31 - +90 555 111 22 33: <Medya dahil edilmedi>`;

describe("WhatsApp dışa aktarma", () => {
  it("iOS biçimini, ekleri ve çok satırlı mesajları okur", () => {
    const m = parseExport(IOS);
    expect(m).toHaveLength(7);
    expect(m[2]).toMatchObject({ sender: "Ayşe Yılmaz", attachment: "00000012-PHOTO-2026-09-20-21-14-30.jpg", text: "" });
    expect(m[5].text).toContain("Cuma 14:00 uygun mu?");
    expect(m[1].at.toISOString()).toBe("2026-09-20T18:14:05.000Z");
  });

  it("Android biçimini ve eki okur", () => {
    const m = parseExport(ANDROID);
    expect(m[1]).toMatchObject({ sender: "+90 555 111 22 33", attachment: "IMG-20260920-WA0003.jpg", text: "dip boya ne kadar" });
  });

  it("fiyatı bulur; saat, tarih ve telefonu fiyat saymaz", () => {
    expect(extractPrice("Balyaj 5.000 TL olur. Cuma 14:00 uygun mu?")).toMatchObject({ min: 5000, max: 5000 });
    expect(extractPrice("3000-4000 arası olur")).toMatchObject({ min: 3000, max: 4000 });
    expect(extractPrice("2 bin lira")).toMatchObject({ min: 2000 });
    expect(extractPrice("3-4 bin arası")).toMatchObject({ min: 3000, max: 4000 });
    expect(extractPrice("1.800₺")).toMatchObject({ min: 1800 });
    expect(extractPrice("Cuma 14:00 uygun mu?")).toBeUndefined();
    expect(extractPrice("Numaramız 0532 123 45 67, arayın")).toBeUndefined();
  });

  it("örnekleri çıkarır, arka arkaya fotoğrafları tek soru sayar ve kişisel bilgiyi siler", () => {
    const m = parseExport(IOS);
    const available = new Set(["00000012-PHOTO-2026-09-20-21-14-30.jpg", "00000013-PHOTO-2026-09-20-21-14-41.jpg"]);
    const [ex, ...rest] = extractExamples(m, ["Nil Saç Atölyesi"], available);
    expect(rest).toHaveLength(0);
    expect(ex.photos).toHaveLength(2);
    expect(ex.customerText).toContain("balyaj yaptırmak istiyorum");
    expect(ex.price).toMatchObject({ min: 5000, max: 5000 });
    expect(ex.staffReply).toContain("[müşteri] Hanım");
    expect(ex.staffReply).toContain("[numara]");
    expect(ex.staffReply).not.toContain("Ayşe");
  });

  it("dosyası zipte olmayan fotoğrafı atlar; salonu sohbetlerden tahmin eder", () => {
    const android = parseExport(ANDROID);
    expect(extractExamples(android, ["Nil Saç Atölyesi"], new Set())).toEqual([]);
    expect(extractExamples(android, ["Nil Saç Atölyesi"], new Set(["IMG-20260920-WA0003.jpg"]))[0].price?.min).toBe(1800);
    expect(guessSalonSenders([parseExport(IOS), android])).toEqual(["Nil Saç Atölyesi"]);
    expect(redact("Ayşe Hanım 0555 111 22 33 a@b.com", ["Ayşe Yılmaz"])).toBe("[müşteri] Hanım [numara] [e-posta]");
  });
});
