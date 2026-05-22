import { useEffect, useRef } from 'react';

interface SandboxedIframeProps {
  content: string;
  className?: string;
  title?: string;
}

export function SandboxedIframe({ content, className, title = "Artifact Preview" }: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const trimmed = content.trim().toLowerCase();
  const isSvg = trimmed.startsWith('<svg') || 
                (trimmed.startsWith('<?xml') && trimmed.includes('<svg'));

  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    
    let enhancedContent = content;
    if (isSvg) {
      enhancedContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #0b0f19;
      /* Grid / checkered background pattern */
      background-image: 
        linear-gradient(45deg, #05070c 25%, transparent 25%), 
        linear-gradient(-45deg, #05070c 25%, transparent 25%), 
        linear-gradient(45deg, transparent 75%, #05070c 75%), 
        linear-gradient(-45deg, transparent 75%, #05070c 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    }
    svg {
      max-width: 90%;
      max-height: 90%;
      filter: drop-shadow(0 10px 25px rgba(0,0,0,0.5));
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    svg:hover {
      transform: scale(1.02);
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
    } else if (!content.includes('<head>')) {
      enhancedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif;}</style></head><body>${content}</body></html>`;
    }

    iframe.srcdoc = enhancedContent;
  }, [content, isSvg]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className={className}
      // Security measures:
      // - allow-scripts: Enables interactivity (charts, maps, etc)
      // - allow-downloads: If the code tries to export data
      // - allow-modals: For alerts/prompts
      // - NO allow-same-origin: Prevents the iframe from accessing the main site's cookies/storage
      // - NO allow-top-navigation: Prevents the iframe from redirecting the main window
      sandbox="allow-scripts allow-downloads allow-modals"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: isSvg ? 'transparent' : 'white'
      }}
    />
  );
}

