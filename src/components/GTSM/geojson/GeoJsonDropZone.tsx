import React, { useState } from 'react';

interface GeoJsonDropZoneProps {
  onFileDropped: (name: string, content: string) => void;
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
      if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            onFileDropped(file.name, event.target.result as string);
          }
        };
        reader.readAsText(file);
      }
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-cyan-950/40 backdrop-blur-sm border-2 border-dashed border-cyan-400 m-2 rounded-lg pointer-events-none transition-all duration-200">
          <div className="text-center font-mono p-6 bg-black/80 border border-zinc-800 rounded shadow-2xl">
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] block mb-2">📥 DROP_GEOJSON_FILE</span>
            <span className="text-zinc-400 text-[10px]">ACCEPTING .GEOJSON OR .JSON UP TO 10MB</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
