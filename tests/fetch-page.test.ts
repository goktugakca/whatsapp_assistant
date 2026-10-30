import { describe, expect, it } from "vitest";
import { assertPublicUrl, fetchPageText, htmlToText } from "@/lib/fetch-page";
import { extractServicesFromText } from "@/lib/price-list-import";

describe("sayfadan fiyat listesi", () => {
  it("HTML'i tablo satırları korunarak metne çevirir", () => {
    const html = `<html><head><title>Nil Saç &amp; Güzellik</title><style>p{}</style></head><body>
      <script>var x=1</script><h1>Fiyatlar</h1><table><tr><td>Kesim + fön</td><td>1.100 TL</td></tr>
      <tr><td>Balyaj</td><td>3.000&nbsp;TL</td></tr></table><p>İletişim</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Kesim + fön | 1.100 TL |");
    expect(text).toContain("Balyaj | 3.000 TL");
    expect(text).not.toContain("var x");
    expect(text).not.toContain("p{}");
  });

  it("iç ağ adreslerini ve http dışı şemaları reddeder", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/x")).rejects.toThrow();
    await expect(assertPublicUrl("http://10.0.0.5/")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow();
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    expect((await assertPublicUrl("https://1.1.1.1/fiyatlar")).hostname).toBe("1.1.1.1");
  });

  it("yönlendirmeyi denetleyerek takip eder, içeriği metne çevirir", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://1.1.1.1/eski") return new Response(null, { status: 301, headers: { location: "/fiyatlar" } });
      if (url === "https://1.1.1.1/fiyatlar")
        return new Response("<html><title>Fiyat</title><body><ul><li>Kesim 500 TL</li></ul></body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      return new Response("yok", { status: 404 });
    }) as typeof fetch;
    const page = await fetchPageText("https://1.1.1.1/eski", fetchImpl);
    expect(page.title).toBe("Fiyat");
    expect(page.text).toContain("Kesim 500 TL");
    expect(page.finalUrl).toBe("https://1.1.1.1/fiyatlar");
    const evil = (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } })) as typeof fetch;
    await expect(fetchPageText("https://1.1.1.1/x", evil)).rejects.toThrow("erişilemez");
  });

  it("metinden hizmet çıkarırken modele sayfa metnini ve kaynağı verir; kısa metinde model çağrılmaz", async () => {
    let sent = "";
    const parse = async (params: { messages: { content: unknown }[] }) => {
      sent = JSON.stringify(params.messages[0].content);
      return { parsed_output: { services: [{ name: "Kesim", priceInfo: "500 TL", durationMinutes: 30, durationEstimated: true, description: "", sameAs: "" }], notes: "" }, stop_reason: "end_turn" };
    };
    const r = await extractServicesFromText({ businessType: "barber", text: "Fiyatlar\nKesim | 500 TL |\nSakal | 200 TL |\n", sourceUrl: "https://x.example/fiyatlar", parse: parse as never });
    expect(r.services[0].name).toBe("Kesim");
    expect(sent).toContain("<sayfa>");
    expect(sent).toContain("x.example");
    const short = await extractServicesFromText({ businessType: "barber", text: "Hoş geldiniz", sourceUrl: "https://x", parse: parse as never });
    expect(short.services).toHaveLength(0);
    expect(short.notes).toContain("ekran görüntüsünü");
  });
});
