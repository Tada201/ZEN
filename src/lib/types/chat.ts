export interface Session {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  generativeUI?: number;
  tags?: string[];
  tokenCount?: number;
  lastModel?: string | null;
  folderId?: string | null;
  archived?: boolean;
}

export interface ChatFolder {
  id: string;
  name: string;
  color?: string | null;
}
