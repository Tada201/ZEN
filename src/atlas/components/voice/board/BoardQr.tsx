import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { VoiceStageQrBlock } from "../voiceStageStore";

export function BoardQr({ block }: { block: VoiceStageQrBlock }) {
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(block.data, {
      width: Math.min(512, Math.max(128, block.size || 256)),
      margin: 2,
      color: { dark: "#ffffff", light: "#00000000" },
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (active) setSource(url);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [block.data, block.size]);

  if (error) return <div className="p-3 text-xs text-white/55">QR generation failed.</div>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      {block.title && <div className="text-xs font-semibold text-white/70">{block.title}</div>}
      {source ? <img src={source} alt={block.title || "QR code"} className="min-h-0 max-h-full max-w-full object-contain" /> : <div className="h-28 w-28 animate-pulse bg-white/[0.04]" />}
    </div>
  );
}
