import type { BusinessType } from "./business";

// Sektör sözlüğü: müşterilerin aynı işlem için kullandığı farklı adlar. İşletme bunları
// girmez; asistan müşterinin yazdığını işletmenin kendi hizmet listesiyle eşleştirirken
// kullanır. Bir terimin burada olması işletmenin o hizmeti verdiği anlamına gelmez.
export interface Term {
  concept: string; // İşlemin genel adı
  aka: string[]; // Müşterilerin yazdığı diğer adlar, kısaltmalar, yaygın yazım hataları
  note?: string; // Karıştırılmaması gereken yakın işlemler, fiyatı etkileyen şeyler
}

const hair: Term[] = [
  { concept: "Kesim", aka: ["saç kesimi", "kestirme", "uç alma", "uç kesimi", "kat", "katlı kesim", "küt kesim", "bob", "kakül"], note: "Uç alma ile model değiştiren kesim farklı fiyatlanabilir." },
  { concept: "Fön", aka: ["föhn", "fon", "brushing", "fön çekim", "düz fön", "dalgalı fön", "maşa", "bigudi", "wavy"] },
  { concept: "Dip boya", aka: ["kök boya", "dip", "beyazları kapatma", "dibini boyatma"], note: "Komple boyadan farklıdır; sadece uzayan kökler boyanır." },
  { concept: "Komple boya", aka: ["tüm saç boya", "full boya", "saç boyama", "renk değişimi"] },
  { concept: "Balyaj", aka: ["ombre", "ombré", "sombre", "gölge balyaj", "air touch", "airtouch", "babylights", "baby lights", "el balyajı", "açık uçlar"], note: "Açma işlemidir; saç uzunluğu ve yoğunluğu fiyatı ve süreyi çok değiştirir." },
  { concept: "Röfle", aka: ["meç", "highlight", "folyo", "ince röfle", "kalın röfle"], note: "Balyajla karıştırılır; işletmenin listesinde hangisi varsa onu sor." },
  { concept: "Renk açma", aka: ["açıcı", "dekolorasyon", "sarıya açma", "beyaza açma", "renk açtırma", "platin"], note: "Genelde birden fazla seans gerekebilir." },
  { concept: "Keratin bakımı", aka: ["brezilya fönü", "brazilian blowout", "keratin", "kalıcı düzleştirme", "japon düzleştirme", "nanoplasti", "saç botoksu", "botoks"], note: "Keratin, botoks ve nanoplasti farklı işlemlerdir; işletme listesinde ayrı ayrıysa hangisini istediğini sor." },
  { concept: "Saç bakımı", aka: ["bakım", "maske", "kerastase", "olaplex", "saç spa", "ritüel"] },
  { concept: "Perma", aka: ["kalıcı dalga", "kıvırcık perma", "dijital perma"] },
  { concept: "Topuz / özel gün saçı", aka: ["gelin başı", "nişan saçı", "abiye saç", "örgü", "topuz", "mezuniyet saçı"], note: "Deneme (prova) ayrı ücretli olabilir." },
  { concept: "Kaynak saç", aka: ["saç kaynağı", "extension", "postiş", "mikro kaynak", "bant kaynak"] },
  { concept: "Makyaj", aka: ["gelin makyajı", "özel gün makyajı", "profesyonel makyaj"] },
];

const barber: Term[] = [
  { concept: "Saç kesimi", aka: ["tıraş", "traş", "saç tıraşı", "kesim", "kısaltma", "fade", "skin fade", "low fade", "taper", "yanlar sıfır", "yan sıfır", "makine", "sıfır numara", "üç numara", "ense"], note: "Berberde 'tıraş' tek başına çoğu zaman saç kesimi demektir." },
  { concept: "Sakal tıraşı", aka: ["sakal", "sakal düzeltme", "sakal şekillendirme", "sakal kesimi", "ustura", "sıcak havlu", "kirli sakal", "sakal kontur"] },
  { concept: "Saç + sakal", aka: ["saç sakal", "sac sakal", "komple", "full tıraş", "saç ve sakal"] },
  { concept: "Çocuk tıraşı", aka: ["çocuk kesimi", "oğlan tıraşı", "çocuk saçı"] },
  { concept: "Yüz ve cilt bakımı", aka: ["cilt bakımı", "maske", "siyah nokta", "buhar", "yüz bakımı"] },
  { concept: "Ağda", aka: ["kulak ağdası", "burun ağdası", "yanak ağdası", "kaş alma", "iple alma", "ip"] },
  { concept: "Damat tıraşı", aka: ["damat paketi", "düğün tıraşı", "damat bakımı"] },
  { concept: "Saç boyama", aka: ["beyaz kapatma", "sakal boyama", "saç boya"] },
];

const nail: Term[] = [
  { concept: "Manikür", aka: ["mani", "el bakımı", "kuru manikür", "rus manikürü", "ıslak manikür", "klasik manikür"] },
  { concept: "Pedikür", aka: ["pedi", "ayak bakımı", "medikal pedikür", "spa pedikür"] },
  { concept: "Kalıcı oje", aka: ["kalıcı", "gel polish", "jel oje", "shellac", "uzun süreli oje", "kalıcı ojeli manikür"], note: "Protez tırnak değildir; doğal tırnağa sürülür." },
  { concept: "Protez tırnak", aka: ["takma tırnak", "jel tırnak", "akrilik", "akrilik tırnak", "tips", "poligel", "polijel", "uzatma"], note: "Jel güçlendirme ile karıştırılır; uzatma yapılıp yapılmayacağını sor." },
  { concept: "Jel güçlendirme", aka: ["güçlendirme", "kalıcı güçlendirme", "rubber base", "baz güçlendirme"] },
  { concept: "Dolgu / bakım", aka: ["dolgu", "refill", "tazeleme", "tırnak bakımı (protez)"], note: "Mevcut protez veya jel tırnakların bakımıdır." },
  { concept: "Nail art", aka: ["tasarım", "desen", "french", "fransız", "ombre tırnak", "baby boomer", "taş", "süsleme", "çizim"], note: "Fiyat tasarıma göre değişir." },
  { concept: "Çıkarma / söküm", aka: ["sökme", "kalıcı çıkarma", "protez çıkarma", "temizleme"], note: "Ek süre ister; mevcut kalıcı oje veya protez olup olmadığını sor." },
];

const dental: Term[] = [
  { concept: "Muayene", aka: ["kontrol", "check-up", "ilk muayene", "konsültasyon", "bakılma", "röntgen", "panoramik"] },
  { concept: "Diş taşı temizliği", aka: ["detartraj", "diş temizliği", "taş temizliği", "polisaj"] },
  { concept: "Dolgu", aka: ["çürük tedavisi", "beyaz dolgu", "kompozit", "diş doldurma"] },
  { concept: "Kanal tedavisi", aka: ["kanal", "sinir aldırma", "sinir tedavisi", "endodonti"] },
  { concept: "Diş çekimi", aka: ["çekim", "20'lik", "yirmilik", "yirmi yaş dişi", "gömülü diş"] },
  { concept: "İmplant", aka: ["vida", "implant diş", "all on four", "all-on-4"] },
  { concept: "Zirkonyum / kaplama", aka: ["zirkon", "kaplama", "kron", "köprü", "porselen", "e-max"] },
  { concept: "Lamina", aka: ["yaprak porselen", "veneer", "gülüş tasarımı", "hollywood smile"] },
  { concept: "Diş beyazlatma", aka: ["beyazlatma", "bleaching", "ofis tipi beyazlatma", "ev tipi beyazlatma"] },
  { concept: "Ortodonti", aka: ["tel", "diş teli", "braket", "şeffaf plak", "invisalign", "plak tedavisi"] },
  { concept: "Protez", aka: ["takma diş", "hareketli protez", "total protez"] },
];

export const glossaries: Record<BusinessType, Term[]> = {
  hair_salon: hair,
  barber,
  nail_salon: nail,
  dental_clinic: dental,
};

export function glossaryText(type: BusinessType): string {
  return glossaries[type]
    .map((t) => `- ${t.concept}: ${t.aka.join(", ")}${t.note ? `. Not: ${t.note}` : ""}`)
    .join("\n");
}
