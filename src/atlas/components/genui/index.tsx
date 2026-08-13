import { z } from "zod/v4";
import { defineComponent, createLibrary } from "@openuidev/react-lang";
import { cn } from "@/lib/utils";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";

import { Stack } from "./Stack";
import { Card } from "./Card";
import { TextContent } from "./TextContent";
import { Grid } from "./Layout";
import { Icon } from "./Icon";

/* ── Core Layout Primitives ─────────────────────────────────── */

export const RootDef = defineComponent({
  name: "Root",
  description: "The root container for the UI.",
  props: z.object({
    children: z.any().describe("The components to display"),
    gap: z.coerce.number().optional().default(4),
    className: z.string().optional()
  }) as any,
  component: ({ props, renderNode }: any) => (
    <div className={cn("genui-openui-root w-full min-w-0 flex flex-col bg-[#0a0a0c] border border-border/10 rounded-2xl p-5 shadow-2xl overflow-hidden", props.className)}>
      <Stack gap={props.gap} direction="column" className="w-full">
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
  }) as any,
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

const getStackProps = () => z.object({
  children: z.any().describe("The components to stack"),
  gap: z.coerce.number().optional().default(4),
  direction: z.enum(["row", "column"]).optional().default("column"),
  className: z.string().optional()
}) as any;

export const StackDef = defineComponent({
  name: "Stack",
  description: "A layout container that stacks children vertically or horizontally.",
  props: getStackProps(),
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
  }) as any,
  component: ({ props, renderNode }: any) => (
    <Card className={cn("genui-openui-card w-full min-w-0", props.className)}>
      {renderNode(props.children)}
    </Card>
  )
});

const getTextProps = () => z.object({
  content: z.string(),
  variant: z.enum(["body", "heading", "label"]).optional().default("body"),
  className: z.string().optional()
}) as any;

export const TextDef = defineComponent({
  name: "Text",
  description: "Renders formatted text content.",
  props: getTextProps(),
  component: ({ props }: any) => <TextContent {...props} />
});

// Alias for TextContent
export const TextContentDef = defineComponent({
  name: "TextContent",
  description: "Renders formatted text content.",
  props: getTextProps(),
  component: ({ props }: any) => <TextContent {...props} />
});

export const VStackDef = defineComponent({
  name: "VStack",
  description: "A layout container that stacks children vertically.",
  props: getStackProps(),
  component: ({ props, renderNode }: any) => (
    <Stack gap={props.gap} direction="column" className={props.className}>
      {renderNode(props.children)}
    </Stack>
  )
});

export const HStackDef = defineComponent({
  name: "HStack",
  description: "A layout container that stacks children horizontally.",
  props: getStackProps(),
  component: ({ props, renderNode }: any) => (
    <Stack gap={props.gap} direction="row" className={props.className}>
      {renderNode(props.children)}
    </Stack>
  )
});


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
  defineComponent({ name: "Grid", description: "A grid layout container.", props: z.object({ children: z.any(), columns: z.number().optional().default(1), gap: z.number().optional().default(4) }) as any, component: ({ props, renderNode }: any) => <Grid cols={props.columns} gap={props.gap}>{renderNode(props.children)}</Grid> }),
  defineComponent({ name: "Icon", description: "Renders an icon.", props: z.object({ name: z.string() }) as any, component: ({ props }: any) => <Icon name={props.name} /> }),
];

const customNames = new Set(coreComponents.map(c => c?.name));
const filteredBase = Object.values(openuiLibrary.components || {})
  .filter((c: any) => !customNames.has(c?.name));

const mergedComponents = [
  ...filteredBase,
  ...coreComponents.filter(c => c && c.name && c.props)
] as any[];

const baseLibrary = createLibrary({ components: mergedComponents });

export const extendedLibrary = {
  ...baseLibrary,
  catalog: {
    ...((baseLibrary as any).catalog || {}),
    ...Object.fromEntries(coreComponents.map(c => [c.name, c]))
  }
};
