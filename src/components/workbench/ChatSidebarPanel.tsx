import { useState } from 'react';
import { SessionSidebar } from '../chat/SessionSidebar';
import { useUIStore } from '../../lib/stores/useUIStore';
import { Session } from '../chat/types';

const MOCK_SESSIONS: Session[] = [
  { id: '1', title: 'OSINT Investigation #1', updatedAt: Date.now(), createdAt: Date.now(), model: 'gpt-4o', systemPrompt: '' },
  { id: '2', title: 'OSINT Investigation #2', updatedAt: Date.now() - 3600000, createdAt: Date.now() - 3600000, model: 'claude-3-5-sonnet', systemPrompt: '' },
  { id: '3', title: 'OSINT Investigation #3', updatedAt: Date.now() - 86400000, createdAt: Date.now() - 86400000, model: 'gemini-1.5-pro', systemPrompt: '' },
];

/**
 * Self-contained SessionSidebar panel for the AppShell sidebar slot.
 * Owns all local session state so MainArea stays clean.
 */
export function ChatSidebarPanel() {
  const { toggleSidebar, setSettingsOpen, setActiveSettingsTab } = useUIStore();
  const [currentSessionId, setCurrentSessionId] = useState('1');
  const [search, setSearch] = useState('');

  return (
    <SessionSidebar
      sessions={MOCK_SESSIONS}
      currentId={currentSessionId}
      onSelect={setCurrentSessionId}
      onCreate={() => console.log('create session')}
      onDelete={() => console.log('delete session')}
      onRename={() => console.log('rename session')}
      onPin={() => console.log('pin session')}
      onExport={() => console.log('export session')}
      onClearAll={() => console.log('clear all')}
      onDeleteAll={() => console.log('delete all')}
      search={search}
      onSearchChange={setSearch}
      setSettingsTab={setActiveSettingsTab}
      setShowSettingsModal={setSettingsOpen}
      onToggleSidebar={toggleSidebar}
    />
  );
}
