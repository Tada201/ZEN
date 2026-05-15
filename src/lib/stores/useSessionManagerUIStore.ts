import { create } from 'zustand';
import { SessionCategory } from '@/components/Zen/modals/session-manager/types';

interface SessionManagerUIState {
    activeCategory: SessionCategory;
    selectedSessionId: string | null;
    searchTerm: string;
    isCreatingFolder: boolean;
    newFolderName: string;

    setActiveCategory: (category: SessionCategory) => void;
    setSelectedSessionId: (id: string | null) => void;
    setSearchTerm: (term: string) => void;
    setIsCreatingFolder: (isCreating: boolean) => void;
    setNewFolderName: (name: string) => void;
    reset: () => void;
}

export const useSessionManagerUIStore = create<SessionManagerUIState>((set) => ({
    activeCategory: 'ACTIVE',
    selectedSessionId: null,
    searchTerm: '',
    isCreatingFolder: false,
    newFolderName: '',

    setActiveCategory: (category) => set({ activeCategory: category }),
    setSelectedSessionId: (id) => set({ selectedSessionId: id }),
    setSearchTerm: (term) => set({ searchTerm: term }),
    setIsCreatingFolder: (isCreating) => set({ isCreatingFolder: isCreating }),
    setNewFolderName: (name) => set({ newFolderName: name }),
    reset: () => set({
        activeCategory: 'ACTIVE',
        selectedSessionId: null,
        searchTerm: '',
        isCreatingFolder: false,
        newFolderName: '',
    }),
}));