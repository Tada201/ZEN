import { useEffect, useRef } from 'react';
import { sanitizeGeneratedHtml, sanitizeGeneratedSvg } from '@/lib/security/generatedContent';

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
    const sanitizedContent = isSvg
      ? sanitizeGeneratedSvg(content)
      : sanitizeGeneratedHtml(content);
    
    let enhancedContent = sanitizedContent;
    if (isSvg) {
      enhancedContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
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
      filter: drop-shadow(0 10px 25px hsl(var(--background) / 0.5));
    }
  </style>
</head>
<body>
  ${sanitizedContent}
</body>
</html>`;
    } else if (!sanitizedContent.includes('<head>')) {
      enhancedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><style>body{margin:0;font-family:sans-serif;}</style></head><body>${sanitizedContent}</body></html>`;
    }

    iframe.srcdoc = enhancedContent;
  }, [content, isSvg]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className={className}
      sandbox=""
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: isSvg ? 'transparent' : 'white'
      }}
    />
  );
}
