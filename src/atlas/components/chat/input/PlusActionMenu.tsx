import React, { memo, useEffect, useId, useRef } from 'react';
import { Plus, Paperclip, ImageIcon, Lightbulb, Compass, Globe, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';
import { MenuItem } from './MenuItem';

interface PlusActionMenuProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pinnedActions: string[];
  togglePin: (id: string) => void;
  /** Whether the Thinking capability should be offered (resolved upstream). */
  showReasoning: boolean;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (val: boolean) => void;
  isWebSearch: boolean;
  setIsWebSearch: (val: boolean) => void;
  generativeUI: boolean;
  setGenerativeUI: (val: boolean) => void;
  onOpenSkills?: () => void;
  supportsImageGen?: boolean;
  isImageGenEnabled?: boolean;
  setIsImageGenEnabled?: (val: boolean) => void;
  compact?: boolean;
}

export const PlusActionMenu = memo(({
  isOpen,
  setIsOpen,
  onFileSelect,
  pinnedActions,
  togglePin,
  showReasoning,
  isThinking,
  setIsThinking,
  isDeepResearch,
  setIsDeepResearch,
  isWebSearch,
  setIsWebSearch,
  generativeUI,
  setGenerativeUI,
  onOpenSkills,
  supportsImageGen = false,
  isImageGenEnabled,
  setIsImageGenEnabled,
  compact = false,
}: PlusActionMenuProps) => {
  const reducedMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const menuId = `composer-add-menu-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => {
        menuRef.current
          ?.querySelector<HTMLButtonElement>('[data-composer-action="true"]')
          ?.focus();
      });
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-composer-action="true"]') ?? [],
    ).filter((item) => !item.disabled);
    if (items.length === 0) return;

    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={onFileSelect}
        accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.csv,.xml,.yaml,.yml,.toml,.py,.rs,.go,.c,.cpp,.h"
      />
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={isOpen ? 'Close add menu' : 'Open add menu'}
        title={isOpen ? 'Close add menu' : 'Open add menu'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={menuId}
        className={cn(
          'composer-control composer-control--icon border',
          compact ? 'p-0.5' : 'mt-0.5 p-1',
          isOpen ? 'composer-control--active' : 'border-transparent bg-transparent',
        )}
      >
        <Plus
          aria-hidden="true"
          className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4')}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} aria-hidden="true" />
            <motion.div
              ref={menuRef}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: 6 }}
              transition={reducedMotion ? { duration: 0 } : {
                duration: motionDurations.fast,
                ease: motionEasings.standard,
              }}
              id={menuId}
              role="dialog"
              aria-label="Add content and capabilities"
              onKeyDown={handleMenuKeyDown}
              className="composer-popover composer-popover--bounded absolute bottom-full left-0 z-30 mb-1 p-1"
            >
              <div className="space-y-0.5">
                <div className="composer-popover-header px-2 py-1 uppercase">Add Content</div>
                <MenuItem icon={Paperclip} label="Photos & Files" onClick={() => fileInputRef.current?.click()} />
                {supportsImageGen && (
                  <MenuItem
                    icon={ImageIcon}
                    label="Create Image"
                    active={isImageGenEnabled}
                    onClick={() => {
                      setIsImageGenEnabled?.(!isImageGenEnabled);
                      setIsOpen(false);
                    }}
                  />
                )}

                <div className="mx-1.5 my-0.5 h-px bg-border" />

                <div className="composer-popover-header px-2 py-1 uppercase">Capabilities</div>
                {!pinnedActions.includes('thinking') && showReasoning && (
                  <MenuItem
                    icon={Lightbulb}
                    label="Thinking"
                    active={isThinking}
                    onPin={() => togglePin('thinking')}
                    onClick={() => { setIsThinking(!isThinking); setIsOpen(false); }}
                  />
                )}
                {!pinnedActions.includes('research') && (
                  <MenuItem
                    icon={Compass}
                    label="Deep Research"
                    active={isDeepResearch}
                    onPin={() => togglePin('research')}
                    onClick={() => { setIsDeepResearch(!isDeepResearch); setIsOpen(false); }}
                  />
                )}
                {!pinnedActions.includes('search') && (
                  <MenuItem
                    icon={Globe}
                    label="Web Search"
                    active={isWebSearch}
                    onPin={() => togglePin('search')}
                    onClick={() => { setIsWebSearch(!isWebSearch); setIsOpen(false); }}
                  />
                )}
                {!pinnedActions.includes('genui') && (
                  <MenuItem
                    icon={Layout}
                    label="Generative UI"
                    active={generativeUI}
                    onPin={() => togglePin('genui')}
                    onClick={() => { setGenerativeUI(!generativeUI); setIsOpen(false); }}
                  />
                )}
                {onOpenSkills && (
                  <MenuItem
                    icon={Layout}
                    label="Manage Skills"
                    onClick={() => { onOpenSkills(); setIsOpen(false); }}
                  />
                )}
                <div className="mx-1.5 my-0.5 h-px bg-border" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
