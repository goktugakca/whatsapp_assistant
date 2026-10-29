// Müşteri adı ve mesajlarında küfür denetimi; koddan uygulanır (model kuralı yetmiyordu).
// Yanlış pozitif pahalı: müşteri uyarılır ve engellenebilir. O yüzden kısa kökler kelime
// içinde değil, yalnızca kelime başında ve masum türevleri dışlanarak aranır:
// "eksik", "klasik", "kesik", "götür", "sayarak", "boks" küfür DEĞİLDİR.
// Türkçe küçük harf, ı/i ayrımı korunur.

const EXACT = new Set(["amk", "aq", "oç", "mk", "awk", "sg", "ananı", "anan", "am", "amcik", "sikik", "siktir", "ibne", "piç"]);

const PATTERNS = [
  /^sik(?!ke)/, // sikerim, siktir…; "sikke" hariç
  /siken|sikerim|sikim|sikt/, // "onursiken" gibi birleşik yazımlar
  /^göt(?!ür)/, // götveren, göte…; "götür" hariç
  /^bok(?!s|hara)/, // "boks", "boksör", "Bokhara" hariç
  /amsız|amcık|amına|amını/,
  /orospu/,
  /^yarr?ak/, // "sayarak" hariç (kelime başı)
  /pezevenk|kahpe|sürtük|yavşak|gavat|taşak|taşşak|ibne|piç/,
];

export function containsProfanity(text: string): boolean {
  const words = text
    .toLocaleLowerCase("tr")
    .replace(/[^a-zçğıöşü\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.some((w) => EXACT.has(w) || PATTERNS.some((p) => p.test(w)));
}
