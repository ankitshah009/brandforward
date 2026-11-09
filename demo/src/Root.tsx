import { Composition } from "remotion";
import { BrandForwardDemo, totalFrames, FPS } from "./Demo";

export const Root: React.FC = () => (
  <Composition id="BrandForwardDemo" component={BrandForwardDemo} durationInFrames={totalFrames()} fps={FPS} width={1920} height={1080} />
);
