import { memo } from 'react';
import { Layout, Lightbulb, Compass, Globe, Paperclip } from 'lucide-react';

interface ActionPillsProps {
  generativeUI: boolean;
  setGenerativeUI: (val: boolean) => void;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (val: boolean) => void;
  isWebSearch: boolean;
  setIsWebSearch: (val: boolean) => void;
  selectedFiles: File[];
  removeFile: (index: number) => void;
}

export const ActionPills = memo(({
  generativeUI, setGenerativeUI,
  isThinking, setIsThinking,
  isDeepResearch, setIsDeepResearch,
  isWebSearch, setIsWebSearch,
  selectedFiles, removeFile
}: ActionPillsProps) => {
  if (!generativeUI && !isThinking && !isDeepResearch && !isWebSearch && selectedFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {generativeUI && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/10 rounded-full text-[12px] font-medium text-violet-700 dark:text-violet-400 transition-colors">
          <Layout className="w-3.5 h-3.5" />
          <span className="responsive-label">Generative UI</span>
          <button 
            onClick={() => setGenerativeUI(false)} 
            className="hover:text-violet-900 dark:hover:text-violet-200 ml-0.5 opacity-70 hover:opacity-100"
            aria-label="Close generative UI"
          >
            ×
          </button>
        </div>
      )}
      {isThinking && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 rounded-full text-[12px] font-medium text-amber-700 dark:text-amber-400 animate-pulse transition-colors">
          <Lightbulb className="w-3.5 h-3.5" />
          <span className="responsive-label">Thinking</span>
          <button 
            onClick={() => setIsThinking(false)} 
            className="hover:text-amber-900 dark:hover:text-amber-200 ml-0.5 opacity-70 hover:opacity-100"
            aria-label="Close thinking"
          >
            ×
          </button>
        </div>
      )}
      {isDeepResearch && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 rounded-full text-[12px] font-medium text-indigo-700 dark:text-indigo-400 transition-colors">
          <Compass className="w-3.5 h-3.5" />
          <span className="responsive-label">Deep Research</span>
          <button 
            onClick={() => setIsDeepResearch(false)} 
            className="hover:text-indigo-900 dark:hover:text-indigo-200 ml-0.5 opacity-70 hover:opacity-100"
            aria-label="Close deep research"
          >
            ×
          </button>
        </div>
      )}
      {isWebSearch && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 rounded-full text-[12px] font-medium text-blue-700 dark:text-blue-400 transition-colors">
          <Globe className="w-3.5 h-3.5" />
          <span className="responsive-label">Web Search</span>
          <button 
            onClick={() => setIsWebSearch(false)} 
            className="hover:text-blue-900 dark:hover:text-blue-200 ml-0.5 opacity-70 hover:opacity-100"
            aria-label="Close web search"
          >
            ×
          </button>
        </div>
      )}
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
