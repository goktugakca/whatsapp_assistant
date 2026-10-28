import { Composition } from "remotion";
import { DURATION, Reklam } from "./Reklam";
import { FPS } from "./theme";

// 1080×1920: Instagram Reels / Story, WhatsApp durumu ve TikTok için dikey.
export function Root() {
  return <Composition id="Reklam" component={Reklam} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />;
}
