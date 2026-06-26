import React from "react";

export const BackgroundVideo = React.memo(() => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.55, filter: 'brightness(0.6) saturate(0.5)' }}
      >
        <source src="/video/boot.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
});

BackgroundVideo.displayName = "BackgroundVideo";
