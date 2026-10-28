import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Appear, Caption, Check, Handwrite, Marker, Note, Ruled, useAppear } from "./parts";
import { color, font, s } from "./theme";

// Sırada tanıtım filmi, 9:16. Hikâye: salon kapanmışken gelen mesajı asistan cevaplar,
// randevuyu deftere yazar, bir gün önce hatırlatır. Örnek işletme ve kişiler uydurmadır.

// Sahneler art arda; üst üste binmezler (karışık görünüyordu).
const LENGTHS = { intro: s(3.2), chat: s(10.6), book: s(5.4), remind: s(3.8), end: s(5.3) };
const SCENES = Object.fromEntries(
  Object.entries(LENGTHS).reduce<[string, { from: number; len: number }][]>((acc, [name, len]) => {
    const prev = acc.at(-1)?.[1];
    return [...acc, [name, { from: prev ? prev.from + prev.len : 0, len }]];
  }, []),
) as Record<keyof typeof LENGTHS, { from: number; len: number }>;
export const DURATION = SCENES.end.from + SCENES.end.len;

// Sahneler arası kısa geçiş: yumuşakça belirir ve kaybolur. Son sahne kaybolmaz; videonun
// son karesi (ve kapak görseli) kapanış ekranı olur.
function Scene({ len, last, children }: { len: number; last: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7, len - 7, len], [0, 1, 1, last ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

export function Reklam() {
  return (
    <AbsoluteFill style={{ backgroundColor: color.paper, fontFamily: font.sans }}>
      {Object.entries(SCENES).map(([name, { from, len }]) => {
        const Body = { intro: Intro, chat: Chat, book: Book, remind: Remind, end: End }[name as keyof typeof SCENES];
        return (
          <Sequence key={name} from={from} durationInFrames={len} name={name}>
            <Scene len={len} last={name === "end"}>
              <Body />
            </Scene>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

// 1) Salon kapandı, telefon titriyor.
function Intro() {
  const frame = useCurrentFrame();
  const buzz = frame > s(1.6) && frame < s(2.6) ? Math.sin(frame * 2.2) * 6 : 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
      <Handwrite at={4} duration={16} style={{ fontSize: 260, lineHeight: 1 }}>
        22:41
      </Handwrite>
      <Caption at={s(0.8)}>Salon kapandı.</Caption>
      <Appear at={s(1.6)} style={{ transform: `rotate(${buzz}deg)` }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            background: color.card,
            borderRadius: 36,
            padding: "28px 40px",
            boxShadow: "0 24px 60px -30px rgba(35,70,184,.45)",
            border: `2px solid ${color.line}`,
          }}
        >
          <ChatIcon />
          <div>
            <div style={{ fontSize: 30, color: color.muted }}>WhatsApp · Ustura Berber</div>
            <div style={{ fontSize: 40, fontWeight: 500, color: color.ink }}>Yeni mesaj: “Cuma akşamı yer var mı?”</div>
          </div>
        </div>
      </Appear>
    </AbsoluteFill>
  );
}

function ChatIcon() {
  return (
    <svg width={72} height={72} viewBox="0 0 24 24">
      <rect x="1" y="1" width="22" height="22" rx="6" fill={color.blue} />
      <path d="M6 8.5h12M6 12h8" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <path d="M7 15.5l-1.5 3 4-2" fill="#fff" />
    </svg>
  );
}

// 2) WhatsApp yazışması: asistan ustayı sorar, saat sunar, randevuyu yazar.
type ChatItem =
  | { at: number; from: "customer"; text: string }
  | { at: number; from: "assistant"; text: string; options?: string[]; tap?: { option: number; at: number } }
  | { at: number; from: "typing"; until: number }
  | { at: number; from: "card" };

const chat: ChatItem[] = [
  { at: 6, from: "customer", text: "Cuma akşamı saç sakal için yer var mı?" },
  { at: 30, from: "typing", until: 50 },
  {
    at: 50,
    from: "assistant",
    text: "Var! Kiminle olsun? Mehmet Usta 700 TL, Can 550 TL.",
    options: ["Mehmet Usta", "Can", "Fark etmez"],
    tap: { option: 0, at: 92 },
  },
  { at: 102, from: "customer", text: "Mehmet Usta" },
  { at: 114, from: "typing", until: 134 },
  {
    at: 134,
    from: "assistant",
    text: "Mehmet Usta cuma 18:00 ve 19:00'da boş. Hangisi uyar?",
    options: ["18:00", "19:00"],
    tap: { option: 1, at: 172 },
  },
  { at: 182, from: "customer", text: "19:00, adım Murat" },
  { at: 196, from: "typing", until: 214 },
  { at: 214, from: "assistant", text: "Teşekkürler Murat! Cuma 19:00'da Mehmet Usta ile randevunuz yazıldı." },
  { at: 230, from: "card" },
];

function Chat() {
  const frame = useCurrentFrame();
  const visible = chat.filter((m) => frame >= m.at && (m.from !== "typing" || frame < m.until));
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 110 }}>
      <Caption at={0}>
        Siz yokken
        <br />
        <Marker at={10}>asistan cevaplıyor.</Marker>
      </Caption>
      <Phone>
        {visible.map((m, i) => (
          <ChatRow key={`${m.at}-${i}`} item={m} />
        ))}
      </Phone>
    </AbsoluteFill>
  );
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 70,
        width: 860,
        height: 1440,
        borderRadius: 90,
        background: color.ink,
        padding: 22,
        boxShadow: "0 50px 100px -50px rgba(28,35,51,.6)",
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 70, overflow: "hidden", background: color.chat, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, background: color.card, padding: "54px 40px 26px", borderBottom: `2px solid ${color.line}` }}>
          <div style={{ width: 76, height: 76, borderRadius: 38, background: color.blue, color: "#fff", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 600 }}>
            UB
          </div>
          <div>
            <div style={{ fontSize: 38, fontWeight: 600, color: color.ink }}>Ustura Berber</div>
            <div style={{ fontSize: 28, color: color.muted }}>çevrimiçi</div>
          </div>
        </div>
        {/* Yeni mesajlar alttan gelir, eskiler üstten kayıp gider (gerçek sohbet gibi). */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 18, padding: "26px 30px 40px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  const frame = useCurrentFrame();
  const p = useAppear(item.at, 16);
  const mine = item.from === "customer";
  const wrap = {
    alignSelf: mine ? "flex-end" : "flex-start",
    maxWidth: "84%",
    opacity: p,
    transform: `translateY(${(1 - p) * 30}px)`,
  } as const;
  const bubble = {
    background: mine ? color.bubbleOut : color.bubbleIn,
    borderRadius: 30,
    padding: "20px 26px",
    fontSize: 36,
    lineHeight: 1.3,
    color: color.ink,
    boxShadow: "0 2px 0 rgba(28,35,51,.06)",
  } as const;

  if (item.from === "typing") {
    return (
      <div style={wrap}>
        <div style={{ ...bubble, display: "flex", gap: 10, padding: "26px 30px" }}>
          {[0, 1, 2].map((d) => (
            <span key={d} style={{ width: 16, height: 16, borderRadius: 8, background: color.muted, opacity: 0.35 + 0.65 * Math.abs(Math.sin((frame + d * 6) / 6)) }} />
          ))}
        </div>
      </div>
    );
  }
  if (item.from === "card") {
    return (
      <div style={{ ...wrap, width: "72%" }}>
        <Ruled line={50} gutter={120} style={{ borderRadius: 26, border: `2px solid ${color.line}`, overflow: "hidden", paddingBottom: 10 }}>
          <div style={{ height: 50, lineHeight: "50px", paddingLeft: 138, fontSize: 26, fontWeight: 500, color: color.ink }}>Cuma, 30 Ekim</div>
          <div style={{ display: "flex", fontFamily: font.hand, color: color.blue, lineHeight: "50px" }}>
            <span style={{ width: 120, textAlign: "right", paddingRight: 14, fontSize: 40 }}>19:00</span>
            <span style={{ paddingLeft: 18, fontSize: 36 }}>Murat · Saç + sakal ✓</span>
          </div>
          <div style={{ height: 50, lineHeight: "50px", paddingLeft: 138, fontSize: 24, color: color.muted }}>Takvime ekle →</div>
        </Ruled>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <div style={bubble}>{item.text}</div>
      {item.from === "assistant" && item.options && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          {item.options.map((o, i) => {
            const tapped = item.tap?.option === i && frame >= item.tap.at;
            const pressing = item.tap?.option === i && frame >= item.tap.at && frame < item.tap.at + 6;
            return (
              <span
                key={o}
                style={{
                  border: `3px solid ${color.blue}`,
                  borderRadius: 999,
                  padding: "12px 28px",
                  fontSize: 32,
                  fontWeight: 500,
                  color: tapped ? "#fff" : color.blue,
                  background: tapped ? color.blue : color.card,
                  transform: `scale(${pressing ? 0.93 : 1})`,
                }}
              >
                {o}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 3) Randevu deftere yazılır.
function Book() {
  const rows: { time: string; text?: string; at?: number; done?: boolean }[] = [
    { time: "17:00", text: "Ali · Saç kesimi", done: true },
    { time: "18:00", text: "Kemal · Sakal", done: true },
    { time: "19:00", text: "Murat · Saç + sakal", at: 16 },
    { time: "20:00" },
  ];
  const LINE = 120;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 60 }}>
      <Caption at={0}>
        Randevu <Marker at={8}>deftere yazıldı.</Marker>
      </Caption>
      <Ruled line={LINE} gutter={230} style={{ width: 940, borderRadius: 40, border: `3px solid ${color.line}`, overflow: "hidden", boxShadow: "0 40px 80px -50px rgba(35,70,184,.55)", transform: "rotate(-1.2deg)" }}>
        <div style={{ height: LINE, display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingLeft: 260, paddingRight: 40, paddingBottom: 26, fontSize: 40 }}>
          <span style={{ fontWeight: 600 }}>Cuma, 30 Ekim</span>
          <span style={{ color: color.muted, fontSize: 32 }}>Mehmet Usta</span>
        </div>
        {rows.map((r) => (
          <div key={r.time} style={{ height: LINE, display: "flex", alignItems: "center" }}>
            <span style={{ width: 230, textAlign: "right", paddingRight: 30, fontFamily: font.hand, fontSize: 70, color: color.blue, opacity: r.at ? 1 : 0.55 }}>{r.time}</span>
            {r.text &&
              (r.at ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 30 }}>
                  <Handwrite at={r.at} duration={34} style={{ fontSize: 66, whiteSpace: "nowrap" }}>
                    {r.text}
                  </Handwrite>
                  <Check at={r.at + 38} size={70} />
                </div>
              ) : (
                <span style={{ paddingLeft: 30, fontFamily: font.hand, fontSize: 60, color: color.blue, opacity: 0.55 }}>{r.text}</span>
              ))}
          </div>
        ))}
        <div style={{ height: LINE / 2 }} />
      </Ruled>
      <Note at={s(2.2)}>↑ gece 22:42'de, siz uyurken</Note>
    </AbsoluteFill>
  );
}

// 4) Bir gün önce otomatik hatırlatma.
function Remind() {
  const { width } = useVideoConfig();
  const p = useAppear(10, 15);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 70 }}>
      <Handwrite at={0} duration={14} style={{ fontSize: 96 }}>
        Perşembe, 18:00
      </Handwrite>
      <div
        style={{
          width: width - 160,
          background: color.card,
          borderRadius: 44,
          padding: "40px 46px",
          border: `2px solid ${color.line}`,
          boxShadow: "0 40px 80px -45px rgba(35,70,184,.55)",
          opacity: p,
          transform: `translateY(${(1 - p) * -80}px)`,
          display: "flex",
          gap: 30,
        }}
      >
        <ChatIcon />
        <div style={{ fontSize: 38, lineHeight: 1.35, color: color.ink }}>
          <div style={{ fontSize: 30, color: color.muted }}>Ustura Berber · şimdi</div>
          Merhaba Murat, yarın 19:00'da Mehmet Usta ile saç + sakal randevunuz var. Görüşmek üzere!
        </div>
      </div>
      <Caption at={s(1.3)}>
        Bir gün önce <Marker at={s(1.6)}>kendiliğinden hatırlatır.</Marker>
      </Caption>
    </AbsoluteFill>
  );
}

// 5) Kapanış.
function End() {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 90 }}>
      <Handwrite at={0} duration={18} style={{ fontSize: 200, fontWeight: 700, lineHeight: 1 }}>
        Sırada
      </Handwrite>
      <Appear at={s(0.7)} style={{ marginTop: 60 }}>
        <div style={{ fontSize: 92, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2, color: color.ink, textAlign: "center" }}>
          Randevu defteriniz <Marker at={s(1.3)}>siz yokken de</Marker> doluyor.
        </div>
      </Appear>
      <Appear at={s(1.9)} style={{ marginTop: 50 }}>
        <div style={{ fontSize: 40, color: color.muted, textAlign: "center" }}>WhatsApp'tan 7/24 randevu · Kuaför · Berber · Tırnak · Klinik</div>
      </Appear>
      <Appear at={s(2.5)} style={{ marginTop: 80 }}>
        <div style={{ background: color.blue, color: "#fff", borderRadius: 999, padding: "34px 70px", fontSize: 50, fontWeight: 600 }}>
          30 gün ücretsiz deneyin
        </div>
      </Appear>
      <Note at={s(3.1)} style={{ marginTop: 50 }}>
        kurulum bizden, taahhüt yok
      </Note>
    </AbsoluteFill>
  );
}
