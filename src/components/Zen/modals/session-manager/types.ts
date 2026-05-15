import {
    MessageSquare,
    Archive,
    Flag,
    Pin,
    Folder
} from 'lucide-react';

export type SessionCategory = 'ACTIVE' | 'ARCHIVED' | 'FLAGGED' | 'PINNED' | 'FOLDERS';

export interface SessionManagerSession {
    id: string;
    title: string;
    model: string | null;
    systemPrompt: string | null;
    folderId: string | null;
    pinned: boolean;
    flagged: boolean;
    archived: boolean;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    tokenCount: number;
}

export interface SessionManagerFolder {
    id: string;
    name: string;
    color: string;
    sessionCount: number;
    createdAt: number;
    updatedAt: number;
}

export type SessionManagerView = 'sessions' | 'folders' | 'trash';

export interface SessionCategoryConfig {
    id: SessionCategory;
    label: string;
    icon: any;
}

export const SESSION_CATEGORIES: SessionCategoryConfig[] = [
    { id: 'ACTIVE', label: 'Active', icon: MessageSquare },
    { id: 'ARCHIVED', label: 'Archived', icon: Archive },
    { id: 'FLAGGED', label: 'Flagged', icon: Flag },
    { id: 'PINNED', label: 'Pinned', icon: Pin },
    { id: 'FOLDERS', label: 'Folders', icon: Folder },
];
