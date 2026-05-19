import { useEffect, useRef } from 'react';

interface SandboxedIframeProps {
  content: string;
  className?: string;
  title?: string;
}

export function SandboxedIframe({ content, className, title = "Artifact Preview" }: SandboxedIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    // We use srcdoc for the content, but we also ensure it's properly handled
    // for re-renders. 
    const iframe = iframeRef.current;
    
    // Add a basic reset and default styles to the head if they aren't there
    const enhancedContent = content.includes('<head>') 
      ? content 
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif;}</style></head><body>${content}</body></html>`;

    iframe.srcdoc = enhancedContent;
  }, [content]);

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
        background: 'white'
      }}
    />
  );
}
