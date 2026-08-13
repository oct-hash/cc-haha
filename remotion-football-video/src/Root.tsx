import { Composition, staticFile, registerRoot } from "remotion";
import { FootballVideo } from "./FootballVideo";
import { getAudioDuration } from "./getAudioDuration";

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const FPS = 30;

export const RemotionRoot = () => {
  return (
    <Composition
      id="FootballReunion"
      component={FootballVideo}
      durationInFrames={Math.ceil(35 * FPS)}
      fps={FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        photo1: staticFile("photo-1.jpg"),
        photo2: staticFile("photo-2.jpg"),
        photo3: staticFile("photo-3.jpg"),
        song: staticFile("song.mp3"),
        videoWidth: VIDEO_WIDTH,
        videoHeight: VIDEO_HEIGHT,
      }}
      calculateMetadata={async ({ props }) => {
        try {
          const songDuration = await getAudioDuration(props.song);
          const totalDuration = Math.min(songDuration, 35);
          return {
            durationInFrames: Math.ceil(totalDuration * FPS),
          };
        } catch {
          return {
            durationInFrames: Math.ceil(35 * FPS),
          };
        }
      }}
    />
  );
};

registerRoot(RemotionRoot);
