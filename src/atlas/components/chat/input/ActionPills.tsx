import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Paperclip, FileText, X } from 'lucide-react';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';

interface ActionPillsProps {
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
  const reducedMotion = useReducedMotion();

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
    <motion.div className="flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto no-scrollbar px-2 pt-2">
      <AnimatePresence initial={false}>
      {selectedFiles.map((file, i) => {
        const isImg = isImageFile(file);
        const isTxt = isTextFile(file);
        const imgUrl = objectUrls[i];

        return (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
            key={`${file.name}:${file.lastModified}:${i}`}
            className="composer-chip shrink-0 pl-1.5 pr-2.5 py-1 text-[12px] font-medium group transition-colors"
          >
            {isImg && imgUrl ? (
              <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-border bg-muted">
                <img 
                  src={imgUrl} 
                  alt={file.name} 
                  className="w-full h-full object-cover" 
                />
              </div>
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                {isTxt ? (
                  <FileText className="w-3.5 h-3.5 text-primary dark:text-primary" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            )}
            
            <div className="flex flex-col min-w-0">
              <span className="max-w-[120px] truncate leading-tight">{file.name}</span>
              <span className="text-[9px] text-muted-foreground dark:text-muted-foreground leading-tight font-normal">
                {isImg ? 'Image' : isTxt ? 'Text File' : 'Attachment'}
              </span>
            </div>

            <button 
              onClick={() => removeFile(i)} 
              className="composer-control composer-control--icon ml-0.5 rounded-md p-0.5"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </motion.div>
        );
      })}
      </AnimatePresence>
    </motion.div>
  );
});

