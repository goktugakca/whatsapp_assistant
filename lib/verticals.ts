import type { BusinessType } from "./business";

// Sektöre özel ayarlar: işletme sahibi bunları girmez, işletme tipini seçince gelir.
export interface Vertical {
  label: string; // "Kuaför"
  staffLabel: string; // Çalışana ne denir: "kuaför", "usta", "hekim"
  rules: string[];
}

export const verticals: Record<BusinessType, Vertical> = {
  hair_salon: {
    label: "Kuaför",
    staffLabel: "kuaför",
    rules: [
      "Boya, röfle, keratin gibi işlemlerin süresi ve fiyatı saçın uzunluğuna ve yoğunluğuna göre değişir; kesin fiyat verme, aralığı söyle ve gerekirse saç uzunluğunu sor.",
      "Müşteri belirli bir kuaförü isterse o kişinin boş saatlerini öner.",
    ],
  },
  barber: {
    label: "Berber",
    staffLabel: "usta",
    rules: [
      "Kısa ve samimi yaz; berber müşterileri genelde hızlı randevu ister.",
      "Müşteri belirli bir ustayı isterse o ustanın boş saatlerini öner.",
    ],
  },
  nail_salon: {
    label: "Tırnak salonu",
    staffLabel: "uzman",
    rules: [
      "Müşterinin tırnaklarında mevcut kalıcı oje veya protez varsa çıkarma işlemi ek süre ister; randevudan önce bunu sor.",
      "Nail art fiyatı tasarıma göre değişir; aralığı söyle, kesin fiyatı salonda belirleneceğini belirt.",
    ],
  },
  dental_clinic: {
    label: "Diş kliniği",
    staffLabel: "hekim",
    rules: [
      "Tıbbi teşhis koyma, ilaç önerme. Şiddetli ağrı, şişlik, kanama, ateş gibi acil belirtilerde hemen handoff_to_human kullan.",
      "Kesin tedavi planı ve fiyatı muayene veya röntgen değerlendirmesinden önce taahhüt etme.",
      "Yurt dışından yazan hastalara transfer, konaklama ve tedavi süresi bilgisini proaktif olarak ver.",
    ],
  },
};
