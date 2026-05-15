
import { useEffect, useState } from "react";
import {
  Boxes, Type, MousePointer, Square, Layers,
  TypeIcon,
  Table, Navigation, MessageSquare, LayoutGrid,
  Palette, Puzzle, Image, BarChart3, Box,
} from "lucide-react";
import { useZen } from "./atlasContext";

const ITEMS = [
  { id: "foundations", label: "Foundations", icon: Type },
  { id: "typography", label: "Typography", icon: TypeIcon },
  { id: "buttons", label: "Buttons", icon: MousePointer },
  { id: "inputs", label: "Inputs & Forms", icon: Square },
  { id: "cards", label: "Cards", icon: Layers },
  { id: "data-display", label: "Data Display", icon: Table },
  { id: "navigation", label: "Navigation", icon: Navigation },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
  { id: "surfaces", label: "Surfaces", icon: LayoutGrid },
  { id: "media", label: "Media", icon: Image },
  { id: "data-viz", label: "Data Viz", icon: BarChart3 },
  { id: "themes", label: "Theme Gallery", icon: Palette },
  { id: "combos", label: "Combos", icon: Puzzle },
  { id: "lab-3d", label: "3D Lab", icon: Box },
];

export function ZenSidebar() {
  const { viewMode, activePage, setActivePage } = useZen();
  const [scrollActive, setScrollActive] = useState("foundations");

  useEffect(() => {
    if (viewMode !== "list") return;
    const sections = ITEMS.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setScrollActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [viewMode]);

  const active = viewMode === "page" ? activePage : scrollActive;

  return (
    <nav
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      aria-label="Sections"
    >
      <div className="px-5 py-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" /> Categories
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                data-active={active === it.id}
                className="nav-item"
                onClick={(e) => {
                  e.preventDefault();
                  if (viewMode === "page") {
                    setActivePage(it.id);
                  } else {
                    document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                <span>{it.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}


