import { memo } from "react";
import { motion } from "framer-motion";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface UnderConstructionBannerProps {
  featureName: string;
  description?: string;
}

export const UnderConstructionBanner = memo(({ featureName, description }: UnderConstructionBannerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/10 bg-amber-500/[0.02] backdrop-blur-md p-6 shadow-2xl transition-all duration-300 hover:border-amber-500/20"
    >
      {/* Dynamic ambient background glow */}
      <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center md:items-start gap-5 relative z-10 text-center md:text-left">
        <div className="relative shrink-0 flex items-center justify-center">
          {/* Animated construction outline */}
          <div className="absolute inset-0 rounded-xl bg-amber-500/10 animate-ping opacity-25" />
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center relative">
            <WorkbenchIcon name="lucide:cone" size={24} className="text-amber-500 animate-bounce" />
          </div>
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <span className="inline-flex self-center md:self-start px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-500">
              Preview Mode
            </span>
            <h4 className="text-[14px] font-black text-zinc-100 uppercase tracking-wider">
              {featureName} is Under Construction
            </h4>
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            {description ||
              "This module is a visual preview configuration. The full capabilities, hooks, and integrations are currently being implemented and wired up to the Tauri Rust core."}
          </p>
          <div className="pt-2 flex items-center justify-center md:justify-start gap-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500/50 animate-pulse" />
              Tauri core interface: Pending
            </span>
            <span className="text-zinc-700">|</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              State: Mock mockup
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
