import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readScreenshot, type ParseScreenshot } from "@/lib/screenshot-import";
import { toExportMessages } from "@/lib/screenshot-messages";
import { extractExamples } from "@/lib/whatsapp-export";

// 400×800 beyaz ekran; sol üstte (10%,20%) 40%×25% kırmızı "fotoğraf".
async function fakeScreenshot() {
  const base = sharp({ create: { width: 400, height: 800, channels: 3, background: "#ffffff" } });
  const red = await sharp({ create: { width: 160, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
  return base.composite([{ input: red, left: 40, top: 160 }]).jpeg().toBuffer();
}

const parse: ParseScreenshot = async () => ({
  stop_reason: "end_turn",
  parsed_output: {
    platform: "whatsapp",
    headerName: "Ayşe Yılmaz",
    notes: "",
    messages: [
      { from: "customer", text: "balyaj kaç para", hasPhoto: false, photoBox: null },
      { from: "customer", text: "", hasPhoto: true, photoBox: { x: 10, y: 20, w: 40, h: 25 } },
      { from: "salon", text: "Saçınız uzun, 5.000 TL olur", hasPhoto: false, photoBox: null },
    ],
  },
});

describe("ekran görüntüsünden örnek", () => {
  it("fotoğrafı kırpar, adı saklamaz, örnek çıkar", async () => {
    const read = await readScreenshot({ mediaType: "image/jpeg", data: await fakeScreenshot() }, parse);
    expect(read.chatKey).toHaveLength(16);
    expect(JSON.stringify(read)).not.toContain("Ayşe");
    const photo = read.messages[1].photo!;
    const meta = await sharp(Buffer.from(photo, "base64")).metadata();
    expect(meta.width).toBe(160);
    expect(meta.height).toBe(200);
    const { data } = await sharp(Buffer.from(photo, "base64")).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200); // kırmızı
    expect(data[1]).toBeLessThan(60);

    const { messages, photos } = toExportMessages([read]);
    const examples = extractExamples(messages, ["salon"], new Set(photos.keys()));
    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({ customerText: "balyaj kaç para", price: { min: 5000, max: 5000 } });
  });

  it("aynı sohbetin iki ekranı art arda birleşir", async () => {
    const read1 = await readScreenshot({ mediaType: "image/jpeg", data: await fakeScreenshot() }, parse);
    const read2 = { ...read1, messages: [{ from: "salon" as const, text: "Cuma uygun musunuz?" }] };
    const { messages } = toExportMessages([read1, read2]);
    expect(messages).toHaveLength(4);
    expect(messages[3].at.getTime()).toBeGreaterThan(messages[2].at.getTime());
  });
});
