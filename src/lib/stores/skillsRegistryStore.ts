import { create } from "zustand";

/**
 * Global open/close state for the skills registry dialog. The registry can
 * be opened from the composer's plus menu (`onOpenSkills`) or the `/skills`
 * slash builtin (intercepted in `useSendHandler` before the message is
 * sent), so ownership lives in a store rather than component state.
 */
interface SkillsRegistryStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useSkillsRegistryStore = create<SkillsRegistryStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
