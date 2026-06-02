import { memo } from 'react';
import { Paperclip } from 'lucide-react';

interface ActionPillsProps {
  generativeUI?: boolean;
  setGenerativeUI?: (val: boolean) => void;
  isThinking?: boolean;
  setIsThinking?: (val: boolean) => void;
  isDeepResearch?: boolean;
  setIsDeepResearch?: (val: boolean) => void;
  isWebSearch?: boolean;
  setIsWebSearch?: (val: boolean) => void;
  selectedFiles: File[];
  removeFile: (index: number) => void;
}

export const ActionPills = memo(({
  selectedFiles, removeFile
}: ActionPillsProps) => {
  // Only render when there are file attachments — mode toggles
  // are already indicated by the lit-up buttons in PinnedActionBar
  if (selectedFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {selectedFiles.map((file, i) => (
        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-500/10 rounded-full text-[12px] font-medium text-zinc-700 dark:text-zinc-300 group transition-colors">
          <Paperclip className="w-3.5 h-3.5" />
          <span className="max-w-[120px] truncate">{file.name}</span>
           <button 
            onClick={() => removeFile(i)} 
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
            aria-label={`Remove ${file.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
});
