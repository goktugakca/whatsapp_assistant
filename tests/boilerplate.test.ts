import { describe, expect, it } from "vitest";
import { findRepeatedLines, stripBoilerplate } from "@/lib/boilerplate";
import { extractExamples, extractStylePairs, removeBoilerplate, type ExportMessage } from "@/lib/whatsapp-export";

const AUTO = `Garage Hair Repair Studio Ankara ile iletişime geçtiğiniz için teşekkür ederiz.
Garage Hair Repair Studio Ankara ile iletişime geçmeniz nedeniyle elde edilen kişisel verilerinizin işlenmesine ilişkin ayrıntılı bilgilere aşağıdaki bağlantıdan ulaşabilirsiniz:
https://garagehairankara.com/kisisel-verilerin-korunmasi.html
Size nasıl yardımcı olabiliriz?`;

const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 10, min));
const chat = (n: number): ExportMessage[] => [
  { at: t(0), sender: "customer", text: "Merhaba saçımı bu şekilde yaptırmak istiyorum fiyat?", attachment: `foto-${n}.jpg` },
  { at: t(1), sender: "salon", text: AUTO },
  { at: t(2), sender: "salon", text: "Merhaba [müşteri] hanım 🌸" },
  { at: t(3), sender: "salon", text: "Saç boyunuza göre" },
  { at: t(4), sender: "salon", text: "Ombre 12.000 TL olur" },
];

describe("otomatik karşılama mesajı", () => {
  it("bilinen kalıplar ve tekrar eden satırlar silinir, gerçek cevap kalır", () => {
    expect(stripBoilerplate(AUTO, new Set())).toBe("");
    const repeated = findRepeatedLines(["Hafta içi 10-20 açığız, randevu için yazın", "Hafta içi 10-20 açığız, randevu için yazın", "x", "Hafta içi 10-20 açığız, randevu için yazın", "Hafta içi 10-20 açığız, randevu için yazın"]);
    expect(stripBoilerplate("Hafta içi 10-20 açığız, randevu için yazın\nTabii hanım", repeated)).toBe("Tabii hanım");
  });

  it("temizlenince fiyat cevabı pencereye girer ve üslup örneğinde KVKK metni kalmaz", () => {
    const raw = [chat(1), chat(2)];
    const photos = (i: number) => new Set([`foto-${i}.jpg`]);
    expect(extractExamples(raw[0], ["salon"], photos(1))[0].staffReply).toContain("iletişime geçtiğiniz");
    const cleaned = removeBoilerplate(raw, ["salon"]);
    const [ex] = extractExamples(cleaned[0], ["salon"], photos(1));
    expect(ex.price).toMatchObject({ min: 12000 });
    expect(ex.staffReply).not.toContain("iletişime");
    const style = extractStylePairs(cleaned[0], ["salon"]);
    expect(style[0].staffReply).toBe("Merhaba [müşteri] hanım 🌸\nSaç boyunuza göre\nOmbre [fiyat] olur");
  });
});
