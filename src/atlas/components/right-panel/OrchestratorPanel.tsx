import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatAnalyticsPanel, WorkflowPanel } from "./RightPanelInsights";

export function OrchestratorPanel() {
  return (
    <div className="flex h-full flex-col bg-background">
      <Tabs defaultValue="workflow" className="flex h-full flex-col">
        <TabsList className="grid w-full grid-cols-2 p-1">
          <TabsTrigger value="workflow" className="text-xs">Workflow</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="workflow" className="flex-1 overflow-hidden">
          <WorkflowPanel />
        </TabsContent>
        <TabsContent value="analytics" className="flex-1 overflow-hidden">
          <ChatAnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
