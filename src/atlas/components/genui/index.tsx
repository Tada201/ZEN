import { z } from "zod/v4";
import { defineComponent, createLibrary } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { cn } from "@/lib/utils";

import { Stack } from "./Stack";
import { Card, CardHeader } from "./Card";
import { TextContent } from "./TextContent";
import { Grid, Row, Col } from "./Layout";
import { Icon } from "./Icon";

/* ── Core Layout Primitives ─────────────────────────────────── */

export const RootDef = defineComponent({
  name: "Root",
  description: "The root container for the UI.",
  props: z.object({
    children: z.any().describe("The components to display"),
    gap: z.coerce.number().optional().default(6),
    className: z.string().optional()
  }),
  component: ({ props, renderNode }: any) => (
    <div className={cn("w-full min-h-full bg-background p-4 sm:p-6 lg:p-8 flex flex-col", props.className)}>
      <Stack gap={props.gap} direction="column" className="w-full h-full max-w-6xl mx-auto">
        {renderNode(props.children)}
      </Stack>
    </div>
  )
});

export const TagDef = defineComponent({
  name: "Tag",
  description: "A small badge-like component for labels.",
  props: z.object({
    content: z.string(),
    variant: z.enum(["success", "warning", "error", "info", "default"]).optional().default("default"),
    size: z.enum(["sm", "md", "lg"]).optional().default("md"),
    className: z.string().optional()
  }),
  component: ({ props }: any) => (
    <div className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      props.variant === "success" && "bg-emerald-500/10 text-emerald-500",
      props.variant === "warning" && "bg-amber-500/10 text-amber-500",
      props.variant === "error" && "bg-rose-500/10 text-rose-500",
      props.variant === "info" && "bg-blue-500/10 text-blue-500",
      props.variant === "default" && "bg-muted/40 text-muted-foreground",
      props.className
    )}>
      {props.content}
    </div>
  )
});

export const StackDef = defineComponent({
  name: "Stack",
  description: "A layout container that stacks children vertically or horizontally.",
  props: z.object({
    children: z.any().describe("The components to stack"),
    gap: z.coerce.number().optional().default(4),
    direction: z.enum(["row", "column"]).optional().default("column"),
    className: z.string().optional()
  }),
  component: ({ props, renderNode }: any) => (
    <Stack gap={props.gap} direction={props.direction} className={props.className}>
      {renderNode(props.children)}
    </Stack>
  )
});

export const CardDef = defineComponent({
  name: "Card",
  description: "A container for grouping content.",
  props: z.object({
    children: z.any().describe("The content of the card"),
    className: z.string().optional()
  }),
  component: ({ props, renderNode }: any) => (
    <Card className={props.className}>
      {renderNode(props.children)}
    </Card>
  )
});

export const TextDef = defineComponent({
  name: "Text",
  description: "Renders formatted text content.",
  props: z.object({
    content: z.string(),
    variant: z.enum(["body", "heading", "label"]).optional().default("body"),
    className: z.string().optional()
  }),
  component: ({ props }: any) => <TextContent {...props} />
});

// Alias for TextContent
export const TextContentDef = { ...TextDef, name: "TextContent" };

export const VStackDef = {
  ...StackDef,
  name: "VStack",
  component: ({ props, renderNode }: any) => (
    <Stack gap={props.gap} direction="column" className={props.className}>
      {renderNode(props.children)}
    </Stack>
  )
};

export const HStackDef = {
  ...StackDef,
  name: "HStack",
  component: ({ props, renderNode }: any) => (
    <Stack gap={props.gap} direction="row" className={props.className}>
      {renderNode(props.children)}
    </Stack>
  )
};

/* ── Library Initialization ────────────────────────────────── */

const coreComponents = [
  RootDef,
  TagDef,
  StackDef,
  VStackDef,
  HStackDef,
  CardDef,
  TextDef,
  TextContentDef,
  defineComponent({ name: "Grid", description: "A grid layout container.", props: z.object({ children: z.any(), columns: z.number().optional().default(1), gap: z.number().optional().default(4) }), component: ({ props, renderNode }: any) => <Grid cols={props.columns} gap={props.gap}>{renderNode(props.children)}</Grid> }),
  defineComponent({ name: "Icon", description: "Renders an icon.", props: z.object({ name: z.string() }), component: ({ props }: any) => <Icon name={props.name} /> }),
];

// Combine base openui components with our core layout components
const baseComponents = Array.isArray((openuiLibrary as any).components) 
  ? (openuiLibrary as any).components 
  : Object.values((openuiLibrary as any).components || {});

const customNames = new Set(coreComponents.map(c => c.name));

const mergedComponents = [
  ...baseComponents.filter((c: any) => c && c.name && !customNames.has(c.name)),
  ...coreComponents
].filter(c => c && c.name && c.props) as any[];

const baseLibrary = createLibrary({ components: mergedComponents });

export const extendedLibrary = {
  ...baseLibrary,
  catalog: {
    ...((baseLibrary as any).catalog || {}),
    ...Object.fromEntries(coreComponents.map(c => [c.name, c]))
  }
};
