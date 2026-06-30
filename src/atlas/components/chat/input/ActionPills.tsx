import { memo, useEffect, useState } from 'react';
import { Paperclip, FileText, X } from 'lucide-react';

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

// Helper to check if a file is an image
const isImageFile = (file: File) => file.type.startsWith('image/');
// Helper to check if a file is a text/code file
const isTextFile = (file: File) => {
  return (
    file.type.startsWith('text/') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.js') ||
    file.name.endsWith('.jsx') ||
    file.name.endsWith('.ts') ||
    file.name.endsWith('.tsx') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.css') ||
    file.name.endsWith('.py') ||
    file.name.endsWith('.rs') ||
    file.name.endsWith('.go') ||
    file.name.endsWith('.html')
  );
};

export const ActionPills = memo(({
  selectedFiles, removeFile
}: ActionPillsProps) => {
  const [objectUrls, setObjectUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    // Generate object URLs for images to show live previews in composer
    const newUrls: Record<number, string> = {};
    selectedFiles.forEach((file, i) => {
      if (isImageFile(file)) {
        newUrls[i] = URL.createObjectURL(file);
      }
    });
    setObjectUrls(newUrls);

    // Cleanup URLs on unmount or file list change
    return () => {
      Object.values(newUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  if (selectedFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {selectedFiles.map((file, i) => {
        const isImg = isImageFile(file);
        const isTxt = isTextFile(file);
        const imgUrl = objectUrls[i];

        return (
          <div 
            key={i} 
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 bg-zinc-500/10 dark:bg-white/5 border border-zinc-500/10 dark:border-white/5 rounded-lg text-[12px] font-medium text-zinc-700 dark:text-zinc-300 group hover:border-zinc-500/20 dark:hover:border-white/10 transition-all duration-200"
          >
            {isImg && imgUrl ? (
              <div className="relative w-6 h-6 rounded overflow-hidden border border-zinc-500/20 dark:border-white/10 shrink-0 bg-zinc-100 dark:bg-zinc-800">
                <img 
                  src={imgUrl} 
                  alt={file.name} 
                  className="w-full h-full object-cover" 
                />
              </div>
            ) : (
              <div className="w-6 h-6 rounded flex items-center justify-center bg-zinc-500/10 dark:bg-white/5 shrink-0">
                {isTxt ? (
                  <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </div>
            )}
            
            <div className="flex flex-col min-w-0">
              <span className="max-w-[120px] truncate leading-tight">{file.name}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight font-normal">
                {isImg ? 'Image' : isTxt ? 'Text File' : 'Attachment'}
              </span>
            </div>

            <button 
              onClick={() => removeFile(i)} 
              className="hover:bg-zinc-500/20 dark:hover:bg-white/10 p-0.5 rounded-full transition-colors ml-1"
              aria-label={`Remove ${file.name}`}
            >
              <X className="w-3 h-3 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" />
            </button>
          </div>
        );
      })}
    </div>
  );
});

