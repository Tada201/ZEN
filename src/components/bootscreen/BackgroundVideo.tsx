import React from "react";

export const BackgroundVideo = React.memo(({ reducedMotion }: { reducedMotion?: boolean }) => {
  if (reducedMotion) {
    return (
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        <div className="absolute inset-0 bg-background/50" />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ willChange: "transform", contain: "strict" }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.55 }} /* Removed heavy runtime CSS filters: brightness and saturate. Bake into source MP4 if needed. */
      >
        <source src="/video/boot.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-background/30" />
    </div>
  );
});

BackgroundVideo.displayName = "BackgroundVideo";
