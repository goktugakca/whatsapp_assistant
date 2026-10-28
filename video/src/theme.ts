import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Uygulamadaki "randevu defteri" kimliği (app/globals.css) ile aynı renkler ve yazılar.
export const color = {
  paper: "#f5f7fb",
  card: "#ffffff",
  ink: "#1c2333",
  muted: "#5d6781",
  line: "#d3ddef",
  blue: "#2346b8",
  pink: "#e8738a",
  marker: "#fff09a",
  bubbleIn: "#ffffff",
  bubbleOut: "#e3eafb",
  chat: "#eef2fa",
};

// Yazı tipleri public/fonts içinde (@fontsource'tan kopyalandı); video internete bağlı
// olmadan da aynı çıksın diye.
const RANGES = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};

function load(family: string, file: string, weights: string[]) {
  for (const weight of weights) {
    for (const [subset, unicodeRange] of Object.entries(RANGES)) {
      void loadFont({ family, weight, unicodeRange, url: staticFile(`fonts/${file}-${subset}-${weight}-normal.woff2`) });
    }
  }
}

load("Rubik", "rubik", ["400", "500", "600", "700"]);
load("Caveat", "caveat", ["500", "700"]);

export const font = {
  sans: "Rubik, sans-serif",
  hand: "Caveat, cursive",
};

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);
