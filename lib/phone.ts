// Telefon numarasını WhatsApp'ın kullandığı biçime (ülke kodlu, sadece rakam) çevirir.
// Panelden elle girilen numaralar, WhatsApp'tan gelen numarayla eşleşsin ve hatırlatma
// gönderilebilsin diye. Türkiye numaraları için "0555 111 22 33" -> "905551112233".
export function normalizePhone(input: string): string | undefined {
  const digits = input.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return undefined;
  if (digits.length === 11 && digits.startsWith("05")) return `9${digits}`;
  if (digits.length === 10 && digits.startsWith("5")) return `90${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return undefined;
}
