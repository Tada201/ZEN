import { Code2 } from 'lucide-react';

interface ArtifactPreviewProps {
  content: string;
  title: string;
  onView: () => void;
}

export function ArtifactPreview({ content, title, onView }: ArtifactPreviewProps) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-500/10 text-blue-500">
            <Code2 className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">{title || 'Artifact'}</span>
        </div>
        <button 
          onClick={onView}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors"
        >
          View Artifact
        </button>
      </div>
      <div className="text-[12px] text-white/40 line-clamp-3 font-mono bg-white/[0.03] p-2 rounded border border-white/[0.06]">
        {content}
      </div>
    </div>
  );
}
