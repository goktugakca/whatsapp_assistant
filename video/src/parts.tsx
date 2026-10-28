import type { CSSProperties, ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "./theme";

// Kare kare görünme: belirli bir kareden sonra yaylanarak içeri girer.
export function useAppear(at: number, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping, mass: 0.7 } });
}

export function Appear({ at, children, from = 40, style }: { at: number; children: ReactNode; from?: number; style?: CSSProperties }) {
  const p = useAppear(at);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * from}px) scale(${0.96 + p * 0.04})`, ...style }}>
      {children}
    </div>
  );
}

// Çizgili defter kâğıdı: mavi satırlar, solda pembe kenar çizgisi.
export function Ruled({ line = 64, gutter = 150, style, children }: { line?: number; gutter?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: color.card,
        backgroundImage: `linear-gradient(90deg, transparent ${gutter}px, ${color.pink} ${gutter}px, ${color.pink} ${gutter + 3}px, transparent ${gutter + 3}px),
          repeating-linear-gradient(transparent 0, transparent ${line - 2}px, ${color.line} ${line - 2}px, ${color.line} ${line}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Elle yazılıyormuş gibi soldan sağa açılan yazı.
export function Handwrite({
  at,
  duration,
  children,
  style,
}: {
  at: number;
  duration: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + duration], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // El yazısı harfleri kutunun dışına taşabildiği için açılma sonunda biraz fazlası gösterilir.
  const right = 100 - p * 1.12;
  return (
    <div
      style={{
        fontFamily: font.hand,
        color: color.blue,
        display: "inline-block",
        flexShrink: 0,
        whiteSpace: "nowrap",
        paddingRight: "0.15em",
        clipPath: `inset(-20% ${right}% -20% -5%)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Altı fosforlu kalemle boyanan kelime.
export function Marker({ at, children }: { at: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 14], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${color.marker}, ${color.marker})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${p}% 42%`,
        backgroundPosition: "0 82%",
        padding: "0 0.06em",
      }}
    >
      {children}
    </span>
  );
}

// Ekranın üstündeki el yazısı not.
export function Note({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <Appear at={at} from={20} style={style}>
      <div style={{ fontFamily: font.hand, fontSize: 64, color: color.blue, lineHeight: 1.05, textAlign: "center" }}>
        {children}
      </div>
    </Appear>
  );
}

export function Caption({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <Appear at={at} from={30} style={style}>
      <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 64, lineHeight: 1.12, color: color.ink, textAlign: "center", letterSpacing: -1 }}>
        {children}
      </div>
    </Appear>
  );
}

export function Check({ at, size = 60 }: { at: number; size?: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <path
        d="M4 12.5l5 5L20 6"
        fill="none"
        stroke={color.blue}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={30}
        strokeDashoffset={30 * (1 - p)}
      />
    </svg>
  );
}
