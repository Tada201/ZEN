import { createContext, useContext, useState, type ReactNode } from "react";
import type { InspectorSelection } from "../theme";
import type { ViewMode } from "../atlasContext";

type UIState = {
  selection: InspectorSelection | null;
  select: (s: InspectorSelection | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  activePage: string;
  setActivePage: (id: string) => void;
};

const UIStateContext = createContext<UIState | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<InspectorSelection | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("page");
  const [activePage, setActivePage] = useState("");

  return (
    <UIStateContext.Provider
      value={{
        selection,
        select: setSelection,
        paletteOpen,
        setPaletteOpen,
        viewMode,
        setViewMode,
        activePage,
        setActivePage,
      }}
    >
      {children}
    </UIStateContext.Provider>
  );
}

export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error("useUIState must be used within UIStateProvider");
  return ctx;
}


