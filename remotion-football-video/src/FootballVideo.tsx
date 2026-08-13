import { useCurrentFrame, useVideoConfig, interpolate, Img, spring } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

type Props = {
  photo1: string;
  photo2: string;
  photo3: string;
  song: string;
  videoWidth: number;
  videoHeight: number;
};

const GREEN_DARK = "#0d2818";
const GREEN = "#1a5632";
const GREEN_BRIGHT = "#2ecc71";
const GOLD = "#f5c842";
const WHITE = "#ffffff";

export const FootballVideo = ({
  photo1,
  photo2,
  photo3,
  song,
  videoWidth,
  videoHeight,
}: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s1End = 4 * fps;
  const s2End = 12 * fps;
  const s3End = 20 * fps;
  const s4End = 28 * fps;
  const totalDuration = 35 * fps;
  const fadeDuration = 0.8 * fps;

  const s1Opacity = interpolate(frame, [s1End - fadeDuration, s1End], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const s2Opacity = interpolate(
    frame,
    [s1End - fadeDuration, s1End, s2End - fadeDuration, s2End],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const s3Opacity = interpolate(
    frame,
    [s2End - fadeDuration, s2End, s3End - fadeDuration, s3End],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const s4Opacity = interpolate(
    frame,
    [s3End - fadeDuration, s3End, s4End - fadeDuration, s4End],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const s5Opacity = interpolate(
    frame,
    [s4End - fadeDuration, s4End, totalDuration],
    [0, 1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const openingTextProgress = spring({
    frame: frame - 0.5 * fps,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const photos = [
    {
      src: photo1,
      label: "那些年",
      caption: "一起踢球的兄弟",
      sceneStart: s1End,
      sceneEnd: s2End,
      // Slide in from RIGHT
      entranceDir: "right" as const,
    },
    {
      src: photo2,
      label: "绿茵场",
      caption: "我们共同的战场",
      sceneStart: s2End,
      sceneEnd: s3End,
      // Slide in from BOTTOM
      entranceDir: "bottom" as const,
    },
    {
      src: photo3,
      label: "兄弟情",
      caption: "一生一世一起走",
      sceneStart: s3End,
      sceneEnd: s4End,
      // Slide in from LEFT
      entranceDir: "left" as const,
    },
  ];

  return (
    <div
      style={{
        width: videoWidth,
        height: videoHeight,
        background: `linear-gradient(135deg, ${GREEN_DARK} 0%, #0a0a0a 50%, ${GREEN_DARK} 100%)`,
        fontFamily,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Audio src={song} volume={0.7} trimBefore={55 * fps} />
      <BackgroundPattern frame={frame} fps={fps} />

      {/* === SCENE 1: Opening === */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity: s1Opacity,
        }}
      >
        <div
          style={{
            fontSize: 120,
            marginBottom: 40,
            transform: `scale(${openingTextProgress}) rotate(${interpolate(openingTextProgress, [0, 1], [-30, 0])}deg)`,
          }}
        >
          ⚽
        </div>
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: WHITE,
            textAlign: "center",
            lineHeight: 1.2,
            letterSpacing: 12,
            transform: `scale(${interpolate(openingTextProgress, [0, 1], [0.5, 1])})`,
          }}
        >
          世界杯之约
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: GOLD,
            marginTop: 30,
            letterSpacing: 6,
            opacity: interpolate(openingTextProgress, [0, 0.5, 1], [0, 0, 1]),
            transform: `translateY(${interpolate(openingTextProgress, [0, 1], [30, 0])}px)`,
          }}
        >
          二十载兄弟情
        </div>
      </div>

      {/* === SCENE 2-4: Animated Photo Slides === */}
      {[s2Opacity, s3Opacity, s4Opacity].map((opacity, i) => (
        <PhotoScene
          key={i}
          frame={frame}
          fps={fps}
          opacity={opacity}
          photo={photos[i]}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
        />
      ))}

      {/* === SCENE 5: Closing === */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          opacity: s5Opacity,
        }}
      >
        <div
          style={{
            fontSize: 80,
            marginBottom: 20,
            transform: `scale(${interpolate(
              Math.sin(frame * 0.15),
              [-1, 1],
              [0.9, 1.1],
            )})`,
          }}
        >
          ⚽
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: WHITE,
            textAlign: "center",
            letterSpacing: 10,
            lineHeight: 1.3,
            textShadow: `0 0 40px ${GREEN_BRIGHT}40, 0 4px 8px rgba(0,0,0,0.5)`,
          }}
        >
          2026世界杯
        </div>
        <div
          style={{
            width: 200,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            marginTop: 30,
            marginBottom: 30,
          }}
        />
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: GOLD,
            letterSpacing: 8,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          }}
        >
          兄弟再聚首
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: WHITE,
            marginTop: 40,
            letterSpacing: 4,
            opacity: 0.75,
          }}
        >
          绿茵场见
        </div>
      </div>
    </div>
  );
};

// ─── Photo Scene with Rich Animation ────────────────────────────────────────

const PhotoScene = ({
  frame,
  fps,
  opacity,
  photo,
  videoWidth,
  videoHeight,
}: {
  frame: number;
  fps: number;
  opacity: number;
  photo: { src: string; label: string; caption: string; sceneStart: number; sceneEnd: number; entranceDir: "left" | "right" | "bottom" };
  videoWidth: number;
  videoHeight: number;
}) => {
  const sceneDuration = photo.sceneEnd - photo.sceneStart;

  // ── Entrance spring (0 → 1) over first 1.5s of scene ──
  const entranceProgress = spring({
    frame: frame - photo.sceneStart,
    fps,
    config: { damping: 10, stiffness: 60 },
    durationInFrames: Math.floor(1.5 * fps),
  });

  // ── Continuous float (subtle up-down) ──
  const floatY = Math.sin((frame - photo.sceneStart) * 0.06) * 12;

  // ── Directional slide-in offset ──
  const dirOffset = {
    right: { x: interpolate(entranceProgress, [0, 1], [200, 0]), y: 0 },
    left: { x: interpolate(entranceProgress, [0, 1], [-200, 0]), y: 0 },
    bottom: { x: 0, y: interpolate(entranceProgress, [0, 1], [150, 0]) },
  };
  const { x: slideX, y: slideY } = dirOffset[photo.entranceDir];

  // ── Entrance rotation ──
  const entranceRotate = interpolate(entranceProgress, [0, 1], [8, 0]);

  // ── Entrance scale bounce ──
  const entranceScale = spring({
    frame: frame - photo.sceneStart,
    fps,
    config: { damping: 8, stiffness: 50 },
    durationInFrames: Math.floor(1.5 * fps),
  });
  const scaleBounce = interpolate(entranceScale, [0, 1], [0.6, 1]);

  // ── Ken Burns zoom (gentle throughout scene) ──
  const localFrame = frame - photo.sceneStart;
  const zoom = interpolate(localFrame, [0, sceneDuration], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Gentle pan across the photo ──
  const panX = interpolate(localFrame, [0, sceneDuration], [
    photo.entranceDir === "right" ? 30 : photo.entranceDir === "left" ? -30 : 0,
    photo.entranceDir === "right" ? -20 : photo.entranceDir === "left" ? 20 : 0,
  ], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const panY = interpolate(localFrame, [0, sceneDuration], [
    photo.entranceDir === "bottom" ? -20 : 10,
    photo.entranceDir === "bottom" ? 10 : -10,
  ], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ── Label entrance (delayed) ──
  const labelSpring = spring({
    frame: frame - photo.sceneStart - 0.3 * fps,
    fps,
    config: { damping: 10, stiffness: 70 },
    durationInFrames: Math.floor(1.2 * fps),
  });

  // ── Caption entrance (more delayed) ──
  const captionSpring = spring({
    frame: frame - photo.sceneStart - 1 * fps,
    fps,
    config: { damping: 12, stiffness: 80 },
    durationInFrames: Math.floor(1 * fps),
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
      }}
    >
      {/* Photo container */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "82%",
            height: "78%",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            transform: [
              `scale(${zoom * scaleBounce})`,
              `translateX(${slideX + panX}px)`,
              `translateY(${slideY + floatY + panY}px)`,
              `rotate(${entranceRotate}deg)`,
            ].join(" "),
          }}
        >
          <Img
            src={photo.src}
            style={{
              width: "110%",
              height: "110%",
              objectFit: "cover",
              // Offset to create parallax pan within the photo
              marginLeft: `-5%`,
              marginTop: `-5%`,
            }}
          />
        </div>

        {/* Vignette overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(13,40,24,0.3) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Label - slides in from top */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: GOLD,
            letterSpacing: 8,
            opacity: labelSpring,
            transform: `translateY(${interpolate(labelSpring, [0, 1], [-40, 0])}px)`,
          }}
        >
          {photo.label}
        </div>
      </div>

      {/* Caption - slides up from bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: WHITE,
            letterSpacing: 4,
            textShadow: "0 2px 20px rgba(0,0,0,0.8)",
            opacity: captionSpring,
            transform: `translateY(${interpolate(captionSpring, [0, 1], [50, 0])}px)`,
          }}
        >
          {photo.caption}
        </div>
      </div>
    </div>
  );
};

// ─── Background Pattern ─────────────────────────────────────────────────────

const BackgroundPattern = ({ frame, fps }: { frame: number; fps: number }) => {
  const rotate = interpolate(frame, [0, 35 * fps], [0, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.03,
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 40px, ${GREEN} 40px, ${GREEN} 41px),
          repeating-linear-gradient(90deg, transparent, transparent 40px, ${GREEN} 40px, ${GREEN} 41px)
        `,
        transform: `rotate(${rotate}deg) scale(1.5)`,
        pointerEvents: "none",
      }}
    />
  );
};
