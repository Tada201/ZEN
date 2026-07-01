import React, { useState } from 'react';

interface GeoJsonDropZoneProps {
  onFileDropped: (file: File) => void;
  children: React.ReactNode;
}

export const GeoJsonDropZone: React.FC<GeoJsonDropZoneProps> = ({ onFileDropped, children }) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      onFileDropped(file);
    }
  };

  return (
    <div 
      onDragEnter={handleDrag} 
      onDragOver={handleDrag} 
      onDragLeave={handleDrag} 
      onDrop={handleDrop}
      className="relative w-full h-full flex-1"
    >
      {isDragActive && (
        <div className="absolute inset-0 z-50 m-3 flex items-center justify-center border border-dashed border-primary/70 bg-background/75 backdrop-blur-sm pointer-events-none transition-all duration-200">
          <div className="border border-border bg-background/95 px-5 py-4 text-center shadow-2xl">
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] block mb-2">DROP_MAP_FILE</span>
            <span className="text-muted-foreground text-[10px]">GeoJSON, CSV, or KML, up to 10 MB</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
