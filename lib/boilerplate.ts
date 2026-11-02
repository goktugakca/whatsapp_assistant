// Salonların WhatsApp Business / Instagram otomatik karşılama ve KVKK mesajları ("…ile iletişime
// geçtiğiniz için teşekkür ederiz… kişisel verileriniz… Size nasıl yardımcı olabiliriz?") her
// sohbette tekrarlanır. Üslup ve fiyat örneklerine girerse asistan bunu taklit eder ve gerçek
// fiyat cevabı örnek penceresinin dışında kalır. İki yolla bulunur: bilinen kalıplar ve aynı
// satırın birçok sohbette birebir tekrarlanması.

const AUTO_REPLY =
  /(iletişime geç(tiğiniz|meniz)|ulaştığınız için teşekkür|ailesine ulaştığınız|kişisel veri|kvkk|aydınlatma metni|gizlilik politika|mesai saatlerimiz dışında|en kısa sürede (size )?dönüş (yapacağız|sağlayacağız)|otomatik (yanıt|mesaj)|https?:\/\/\S+kisisel)/i;

const norm = (line: string) => line.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

// Birçok farklı cevapta birebir geçen uzun satırlar (≥ minCount kez, ≥ 20 karakter).
export function findRepeatedLines(texts: string[], minCount = 4): Set<string> {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const line of new Set(t.split("\n").map(norm))) {
      if (line.length >= 20) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, c]) => c >= minCount).map(([l]) => l));
}

export function isBoilerplateLine(line: string, repeated: Set<string>): boolean {
  const n = norm(line);
  if (!n) return false;
  if (repeated.has(n) || AUTO_REPLY.test(n)) return true;
  // Otomatik mesajın son satırı tek başına sık görülür; kısa genel karşılama da atılır.
  return /^(size )?nasıl yardımcı olabiliriz\??$/.test(n);
}

export function stripBoilerplate(text: string, repeated: Set<string>): string {
  return text
    .split("\n")
    .filter((line) => !isBoilerplateLine(line, repeated))
    .join("\n")
    .trim();
}
