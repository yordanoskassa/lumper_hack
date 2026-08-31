import {Composition} from "remotion";
import {SilentStory} from "./SilentStory";

export const FPS = 30;
export const DURATION = 117 * FPS;

export const RemotionRoot = () => (
  <Composition
    id="LumperBackstop"
    component={SilentStory}
    durationInFrames={DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
