// Müşteri adı gibi veritabanına ve takvime yazılan metinlerde küfür denetimi. Model kuralı
// yetmeyebilir ("onursiken amsızoğlu" adıyla randevu alınmıştı); bu liste koddan uygulanır.
// Kökler Türkçe küçük harfle, ı/i ayrımı korunarak aranır. Kısa olanlar yalnızca kelime
// olarak eşleşir (ör. "amk"), uzunlar kelime içinde de ("sikerim", "amsızoğlu").

const ROOTS = [
  "sik",
  "amsız",
  "amcık",
  "amına",
  "amını",
  "orospu",
  "piç",
  "yarrak",
  "yarak",
  "göt",
  "ibne",
  "pezevenk",
  "kahpe",
  "sürtük",
  "yavşak",
  "gavat",
  "taşak",
  "taşşak",
  "döl",
  "bok",
];
const WORDS = ["amk", "aq", "oç", "mk", "awk", "sg", "ananı", "anan", "am", "amcik", "sikik", "siktir"];

// Kökü içerdiği hâlde masum olan kelimeler; Türkçe'de yaygın ad ve sözcükler.
const ALLOW = ["bokhara", "siku", "amsterdam"];

export function containsProfanity(text: string): boolean {
  const words = text
    .toLocaleLowerCase("tr")
    .replace(/[^a-zçğıöşü\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const w of words) {
    if (ALLOW.includes(w)) continue;
    if (WORDS.includes(w)) return true;
    if (ROOTS.some((r) => w.includes(r))) return true;
  }
  return false;
}
