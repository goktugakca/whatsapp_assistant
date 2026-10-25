import type { BusinessType } from "./business";

// Demo sayfasında her sektör için önerilen örnek mesajlar.
export const demoExamples: Record<BusinessType, string[]> = {
  hair_salon: [
    "Merhaba, yarın öğleden sonra kesim için yeriniz var mı?",
    "Röfle ne kadar? Saçlarım omuz hizasında.",
    "Cumartesi Selin Hanım'a keratin randevusu alabilir miyim?",
  ],
  barber: [
    "Abi bugün akşam saç sakal için yer var mı?",
    "Mehmet Usta yarın kaçta boş?",
    "Hi, do you speak English? I need a haircut tomorrow.",
  ],
  nail_salon: [
    "Merhaba, kalıcı oje fiyatınız ne kadar?",
    "Başka yerde yaptırdığım protez var, çıkarıp yenisini yapar mısınız?",
    "Perşembe Buse Hanım'a protez tırnak randevusu istiyorum.",
  ],
  dental_clinic: [
    "Merhaba, implant fiyatları ne kadar?",
    "Hi, I'm from London. How many days do I need to stay for zirconia crowns?",
    "مرحبا، هل يوجد نقل من المطار؟",
  ],
};
