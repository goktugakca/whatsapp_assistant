import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { barber } from "@/lib/businesses/barber";
import { InMemoryStore } from "@/lib/store";
import { pickStyleExamples } from "@/lib/style-examples";
import { extractStylePairs, maskVolatile, parseExport } from "@/lib/whatsapp-export";

const chat = `[01.10.2026 10:00:00] Garage Ankara: Mesajlar ve aramalar uçtan uca şifrelidir.
[01.10.2026 10:01:00] Murat Kaya: selam abi yarın 14:00 boş musunuz
[01.10.2026 10:01:20] Murat Kaya: sıfır numara kesim
[01.10.2026 10:05:00] Garage Ankara: Selam hocam 👋 yarın 14:30 var, sıfır kesim 450 TL. Murat bey numaranız 0532 111 22 33 değil mi?
[01.10.2026 10:05:10] Garage Ankara: Yazıyorum sizi
[02.10.2026 09:00:00] Murat Kaya: amk gelemicem
[02.10.2026 09:01:00] Garage Ankara: Tamam abi sorun değil
[03.10.2026 09:00:00] Murat Kaya: ‎<ekli: 00000020-PHOTO-2026-10-03-09-00-00.jpg>
[03.10.2026 09:02:00] Garage Ankara: Bu modele 2 bin civarı olur kral`;

describe("üslup örnekleri", () => {
  it("müşteri→salon çiftlerini çıkarır; ad, numara, fiyat, saat gizlenir; sistem ve küfürlü satırlar alınmaz", () => {
    const pairs = extractStylePairs(parseExport(chat), ["Garage Ankara"]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].customerText).toBe("selam abi yarın [saat] boş musunuz\nsıfır numara kesim");
    expect(pairs[0].staffReply).toContain("Selam hocam 👋 yarın [saat] var, sıfır kesim [fiyat].");
    expect(pairs[0].staffReply).toContain("[müşteri] bey");
    expect(pairs[0].staffReply).toContain("[numara]");
    expect(pairs[0].staffReply).toContain("Yazıyorum sizi");
    expect(JSON.stringify(pairs)).not.toContain("450");
    expect(JSON.stringify(pairs)).not.toContain("amk");
    expect(pairs[1]).toEqual({ customerText: "(fotoğraf gönderdi)", staffReply: "Bu modele [fiyat] civarı olur kral" });
  });

  it("fiyat yazımlarını gizler", () => {
    expect(maskVolatile("Kesim 1.500 TL, boya 2000-2500₺, fön 3 bin")).toBe("Kesim [fiyat], boya [fiyat], fön [fiyat]");
    expect(maskVolatile("Cuma 19.30 uygun, 12.10 tarihinde")).toBe("Cuma [saat] uygun, [tarih] tarihinde");
  });

  it("istemde üslup bölümü ve fiyat uyarısı; aynı cevaplar bir kez", async () => {
    const store = new InMemoryStore();
    await store.addStyleExamples(barber.id, [
      { customerText: "selam", staffReply: "Selam hocam buyrun", hash: "a" },
      { customerText: "merhaba", staffReply: "Selam hocam buyrun", hash: "b" },
      { customerText: "fiyat?", staffReply: "Sıfır kesim [fiyat] kral", hash: "c" },
      { customerText: "selam", staffReply: "Selam hocam buyrun", hash: "a" },
    ]);
    const list = await store.listStyleExamples(barber.id);
    expect(list).toHaveLength(3);
    const picked = pickStyleExamples(list);
    expect(picked).toHaveLength(2);
    const prompt = buildSystemPrompt(barber, picked);
    expect(prompt).toContain("Salonun kendi yazışmalarından örnekler");
    expect(prompt).toContain("Salon: Sıfır kesim [fiyat] kral");
    expect(prompt).toContain("asla buradan çıkarma");
    expect(buildSystemPrompt(barber)).not.toContain("Salonun kendi yazışmalarından");
    await store.setStyleExampleIncluded(barber.id, list[0].id, false);
    expect(pickStyleExamples(await store.listStyleExamples(barber.id)).length).toBeLessThanOrEqual(2);
  });
});
