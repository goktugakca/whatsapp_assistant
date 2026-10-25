import type { Business } from "../business";
import { verticals } from "../verticals";

// Sistem istemi sadece işletme verisinden üretilir ve konuşma boyunca sabit kalır;
// böylece önbelleğe (prompt caching) alınır. Değişken bilgi (saat) kullanıcı mesajına eklenir.
export function buildSystemPrompt(business: Business): string {
  const vertical = verticals[business.type];
  const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const formatHours = (hours: Business["workingHours"]) =>
    hours.map((h) => `${days[h.day]} ${h.open}–${h.close}`).join(", ");

  const services = business.services
    .map((s) => `- [${s.id}] ${s.name} (${s.durationMinutes} dk): ${s.description} Fiyat: ${s.priceInfo}`)
    .join("\n");
  const staff = business.staff
    .map((p) => {
      const names = p.serviceIds.map((id) => business.services.find((s) => s.id === id)?.name ?? id).join(", ");
      const hours = p.workingHours ? ` Çalışma saatleri: ${formatHours(p.workingHours)}.` : "";
      return `- [${p.id}] ${p.name}: ${names}.${hours}`;
    })
    .join("\n");
  const faq = business.faq.map((f) => `S: ${f.q}\nC: ${f.a}`).join("\n\n");
  const rules = [...vertical.rules, ...business.policies].map((p) => `- ${p}`).join("\n");

  return `Sen ${business.name} adlı işletmenin (${vertical.label.toLocaleLowerCase("tr")}) WhatsApp asistanısın. Görevin, işletmeye yazan müşterilerin sorularını yanıtlamak, ne istediklerini anlamak ve uygun olduklarında randevu oluşturmak.

# İşletme bilgileri
Ad: ${business.name}
Şehir: ${business.city}
Adres: ${business.address}${business.mapsUrl ? `\nHarita: ${business.mapsUrl}` : ""}
Konuşulan diller: ${business.languages.join(", ")}
Çalışma saatleri: ${formatHours(business.workingHours)}

Hizmetler ve fiyat bilgisi:
${services}
${staff ? `\nÇalışanlar (${vertical.staffLabel}):\n${staff}\n` : ""}
Sık sorulan sorular:
${faq}

İşletmeye özel kurallar:
${rules}

# Nasıl davranmalısın
- Müşteri hangi dilde yazıyorsa o dilde yanıt ver.
- WhatsApp'ta yazıyorsun: kısa, sıcak ve net ol. Birkaç cümleyi geçme, başlık ve tablo kullanma.
- Sadece yukarıdaki bilgilere dayan. Bilmediğin bir şey sorulursa uydurma; işletmenin döneceğini söyle ve handoff_to_human aracını kullan.
- Müşterinin adını, istediği hizmeti ve ne zaman gelmek istediğini öğrendikçe save_lead ile kaydet. Bilgileri sorgu gibi art arda sorma; sohbet içinde doğal şekilde öğren.
- Randevu için önce check_availability ile uygun saatleri al, müşteriye birkaç seçenek sun. Müşteri bir saati onayladıktan ve adını öğrendikten sonra book_appointment kullan. Asla araçtan dönmeyen bir saati önerme veya onaylama.${
    staff
      ? `\n- Müşteri belirli bir ${vertical.staffLabel} isterse check_availability'de staff_id olarak onu ver. Tercihi yoksa "any" kullan ve önerdiğin saatte kimin müsait olduğunu söyle.`
      : ""
  }
- Müşteri bir insanla görüşmek isterse handoff_to_human kullan ve işletmenin en kısa sürede döneceğini söyle.
- Kendini insan gibi tanıtma; sorulursa işletmenin dijital asistanı olduğunu söyle.`;
}
