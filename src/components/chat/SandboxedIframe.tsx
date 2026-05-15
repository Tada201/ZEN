import React, { useEffect, useRef } from "react";

interface SandboxedIframeProps {
  content: string;
  type?: "html" | "svg";
  title?: string;
  className?: string;
}

export function SandboxedIframe({ content, type = "html", title, className }: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let blobContent = content;
    let mimeType = "text/html";

    if (type === "svg") {
      mimeType = "image/svg+xml";
    } else {
      // Wrap in basic HTML if it's just a fragment
      if (!content.includes("<html") && !content.includes("<body")) {
        blobContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { 
                  margin: 0; 
                  padding: 20px; 
                  font-family: system-ui, -apple-system, sans-serif;
                  background: transparent;
                  color: inherit;
                }
              </style>
            </head>
            <body>${content}</body>
          </html>
        `;
      }
    }

    const blob = new Blob([blobContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    iframe.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [content, type]);

  return (
    <iframe
      ref={iframeRef}
      title={title || "Sandboxed Content"}
      sandbox="allow-scripts"
      className={className}
      style={{ border: "none", width: "100%", height: "100%", background: "transparent" }}
    />
  );
}
