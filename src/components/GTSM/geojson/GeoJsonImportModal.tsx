import React, { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';

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
    <AppDialog
      open
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Import map layer"
      description="Review the local data before adding it to the map workspace."
      footer={(
        <>
          <button type="button" onClick={onCancel} className="border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-300 hover:bg-white/[0.08]">Cancel</button>
          <button type="button" onClick={handleConfirm} className="border border-primary/40 bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/25">Import layer</button>
        </>
      )}
      className="font-mono"
    >
      <div className="flex flex-col gap-4 text-xs">
        <div className="bg-white/[0.025] border border-white/10 p-2.5 flex flex-col gap-1 text-[10px] text-zinc-400">
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

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Layer Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-2.5 bg-white/[0.025] border border-white/10 text-white focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-16 p-2 bg-white/[0.025] border border-white/10 text-white focus:outline-none focus:border-primary/60 resize-none transition-colors"
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

      </div>
    </AppDialog>
  );
};
