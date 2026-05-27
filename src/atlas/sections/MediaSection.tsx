import { useEffect, useRef } from "react";
import { DemoCard } from "../Section";
import { AudioPlayer } from "./MediaAudioPlayer";
import { VideoPlayer } from "./MediaVideoPlayer";
import { CompareSlider, DropZoneTile, ImageGallery, WebcamTile } from "./MediaVisualDemos";

export function MediaSection() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in-view")),
      { threshold: 0.08 }
    );
    el.querySelectorAll(".reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section id="media" ref={ref} className="scroll-mt-20 py-16" style={{ contentVisibility: "auto" }}>
      <header className="reveal mb-10 border-l-2 border-primary pl-5">
        <h2 className="gradient-text text-4xl font-bold tracking-tight md:text-5xl">Media</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Pro-grade video, audio, gallery, capture, upload, and compare components — all with real playback.
        </p>
      </header>

      {/* Featured row: large video on the left, two stacked tiles on the right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DemoCard
          label="Video · Pro"
          selection={{
            id: "m-video", name: "Video Player", category: "Media",
            variants: ["drag-seek", "hover-preview", "shortcuts", "PiP", "fullscreen", "speed", "captions", "buffer"],
            jsx: '<video onTimeUpdate onProgress /><HoverPreview /><Shortcuts />',
          }}
          className="lg:col-span-2 lg:row-span-2"
        >
          <VideoPlayer />
        </DemoCard>

        <DemoCard
          label="Audio · Playlist"
          selection={{
            id: "m-audio", name: "Audio Player + Playlist", category: "Media",
            variants: ["waveform", "click-to-seek", "queue", "loop", "shuffle", "volume"],
            jsx: '<AudioPlayer playlist={tracks} />',
          }}
        >
          <AudioPlayer />
        </DemoCard>

        <DemoCard
          label="Compare"
          selection={{
            id: "m-compare", name: "Before/After Slider", category: "Media",
            variants: ["drag", "keyboard", "touch"],
            jsx: '<CompareSlider before={a} after={b} />',
          }}
        >
          <CompareSlider />
        </DemoCard>
      </div>

      {/* Secondary row of tiles */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DemoCard
          label="Gallery"
          selection={{
            id: "m-lightbox", name: "Image Gallery + Lightbox", category: "Media",
            variants: ["search", "tags", "masonry", "slideshow", "share", "download"],
            jsx: '<Lightbox plugins={[Thumbnails, Zoom, Slideshow, Captions]} />',
          }}
        >
          <ImageGallery />
        </DemoCard>

        <DemoCard
          label="Webcam"
          selection={{
            id: "m-webcam", name: "Webcam Capture", category: "Media",
            variants: ["live-preview", "snapshot", "permissions"],
            jsx: 'navigator.mediaDevices.getUserMedia({ video: true })',
          }}
        >
          <WebcamTile />
        </DemoCard>

        <DemoCard
          label="Upload"
          selection={{
            id: "m-drop", name: "Drag & Drop Upload", category: "Media",
            variants: ["drop", "click", "preview", "remove"],
            jsx: '<input type="file" multiple accept="image/*,video/*,audio/*" />',
          }}
        >
          <DropZoneTile />
        </DemoCard>
      </div>
    </section>
  );
}

export default MediaSection;

