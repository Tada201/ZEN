import React, { useState } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface GeoJsonImportModalProps {
  fileName: string;
  fileContent: string;
  onConfirm: (name: string, description: string, color: string) => void;
  onCancel: () => void;
}

export const GeoJsonImportModal: React.FC<GeoJsonImportModalProps> = ({
  fileName,
  fileContent,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(fileName.replace(/\.[^/.]+$/, ""));
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#00e5ff');

  // Simple local parsing for preview
  let featureCount = 0;
  let geometryTypes: string[] = [];
  try {
    const parsed = JSON.parse(fileContent);
    if (parsed.type === 'FeatureCollection') {
      featureCount = parsed.features?.length || 0;
      const types = new Set<string>();
      parsed.features?.forEach((f: any) => {
        if (f.geometry?.type) types.add(f.geometry.type);
      });
      geometryTypes = Array.from(types);
    } else if (parsed.type === 'Feature') {
      featureCount = 1;
      geometryTypes = parsed.geometry?.type ? [parsed.geometry.type] : [];
    } else {
      featureCount = 1;
      geometryTypes = parsed.type ? [parsed.type] : [];
    }
  } catch (e) {
    // Handled in backend validation
  }

  const handleConfirm = () => {
    onConfirm(name, description, color);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-mono select-none">
      <div className="w-full max-w-md border border-zinc-800 bg-black/90 p-5 rounded-lg shadow-2xl flex flex-col gap-4 text-xs">
        {/* Header */}
        <div className="flex items-center gap-2 text-cyan-400 border-b border-zinc-800 pb-2">
          <WorkbenchIcon name="solar:import-bold-duotone" size={16} />
          <span className="font-bold tracking-widest text-[10px]">IMPORT_GEOJSON_MANIFEST</span>
        </div>

        {/* Preview Stats */}
        <div className="bg-zinc-950/60 border border-zinc-900 p-2.5 rounded flex flex-col gap-1 text-[10px] text-zinc-400">
          <div className="flex justify-between">
            <span>FILE:</span>
            <span className="text-zinc-200 truncate max-w-[240px]">{fileName}</span>
          </div>
          <div className="flex justify-between">
            <span>FEATURES_DETECTED:</span>
            <span className="text-cyan-400 font-bold">{featureCount}</span>
          </div>
          <div className="flex justify-between">
            <span>GEOMETRY_TYPES:</span>
            <span className="text-zinc-200">{geometryTypes.join(', ') || 'UNKNOWN'}</span>
          </div>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Layer Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-2.5 bg-black/40 border border-zinc-800 rounded text-white focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-16 p-2 bg-black/40 border border-zinc-800 rounded text-white focus:outline-none focus:border-cyan-400/50 resize-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Layer Vector Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 bg-transparent border-0 cursor-pointer"
              />
              <span className="text-[10px] text-zinc-400 font-mono uppercase">{color}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white transition-all rounded font-bold tracking-wider text-[9px] uppercase cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 bg-cyan-950/40 border border-cyan-800 text-cyan-400 hover:bg-cyan-950/60 hover:text-cyan-300 transition-all rounded font-bold tracking-wider text-[9px] uppercase cursor-pointer"
          >
            Import Layer
          </button>
        </div>
      </div>
    </div>
  );
};
