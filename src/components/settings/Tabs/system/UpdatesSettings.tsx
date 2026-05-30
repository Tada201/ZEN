import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { UnderConstructionBanner } from '@/components/settings/ui/UnderConstructionBanner';

export const UpdatesSettings = memo(() => {
  // Use settings store as primary, with fallback for standalone usage
  const autoCheckEnabled = useSettingsStore(s => s.autoCheckEnabled ?? true);
  const checkBeta = useSettingsStore(s => s.checkBeta ?? false);
  const updateSetting = useSettingsStore(s => s.updateSetting);

  const formatDate = (ts: number | null) => ts ? new Date(ts).toLocaleString() : 'Never';

  // Fallback state for when used without full store integration
  const currentVersion = '1.0.0';
  const updateAvailable = false;
  const latestVersion = '1.0.0';
  const isChecking = false;
  const lastCheck: number | null = null;
  const isDownloading = false;
  const downloadProgress = 0;
  const error: string | null = null;

  const handleCheckForUpdates = async () => {
    // TODO(config-wireup): replace this no-op with a Tauri updater command after native
    // package verification, channel selection, and installer rollback are implemented.
    console.info('[UpdatesSettings] Manual update check requested');
  };

  return (
    <div className="flex flex-col gap-8">
      <UnderConstructionBanner
        featureName="System Updates"
        description="The System Updates panel is currently simulated. Full OTA package verification, binary payload diffing, and Tauri native background installer integration are under active development."
      />
      <SettingsCard
        title="Update Channels"
        subtitle="Update Settings"
        description="Configure how the application checks for and downloads new updates."
        icon="codicon:archive"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-white">Automatic Updates</span>
              <span className="text-[11px] text-zinc-500">Check for stable release updates automatically</span>
            </div>
            <WorkbenchSwitch
              checked={autoCheckEnabled}
              onCheckedChange={(checked) => updateSetting({ autoCheckEnabled: checked } as any)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-white">Beta Channel</span>
              <span className="text-[11px] text-zinc-500">Opt-in for early access to experimental features</span>
            </div>
            <WorkbenchSwitch
              checked={checkBeta}
              onCheckedChange={(checked) => updateSetting({ checkBeta: checked } as any)}
            />
          </div>
        </div>
      </SettingsCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsCard
          title="System Information"
          subtitle="Version & Check Info"
          description="Current installation version and check history."
          icon="codicon:history"
        >
          <div className="flex gap-4">
            <div className="flex-1 p-4 bg-zinc-900 border border-white/5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <WorkbenchIcon name="codicon:archive" size={14} className="text-zinc-400" />
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Version</span>
              </div>
              <span className="text-2xl font-bold text-brand-purple font-mono">v{currentVersion}</span>
            </div>

            <div className="flex-1 p-4 bg-zinc-900 border border-white/5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <WorkbenchIcon name="codicon:history" size={14} className="text-zinc-400" />
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Last Check</span>
              </div>
              <span className="text-sm font-bold text-zinc-200">{formatDate(lastCheck)}</span>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Update Controls"
          subtitle="Maintenance"
          description="Manually check for and install updates."
          icon="codicon:refresh"
        >
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 overflow-hidden"
                >
                  <WorkbenchIcon name="codicon:error" size={16} className="text-red-500 flex-shrink-0" />
                  <span className="text-xs font-bold text-red-100">Check Failed: {error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {updateAvailable && (
              <div className="p-4 bg-brand-purple/10 border border-brand-purple/20 rounded-xl flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-purple/20 flex items-center justify-center border border-brand-purple/30">
                    <WorkbenchIcon name="codicon:check-all" size={20} className="text-brand-purple" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold text-brand-purple-bright">Update Available</span>
                    <span className="text-xs text-brand-purple/80 font-mono">v{latestVersion}</span>
                  </div>
                </div>

                <WorkbenchButton
                  variant="secondary"
                  onClick={() => {}}
                  disabled={isDownloading}
                  className="w-full h-10 gap-2 border-brand-purple/30 hover:bg-brand-purple/20 text-brand-purple"
                >
                  <WorkbenchIcon name="codicon:cloud-download" size={16} />
                  <span className="text-xs font-extrabold uppercase tracking-tight">
                    {isDownloading ? `Downloading: ${downloadProgress}%` : `Install Update Now`}
                  </span>
                </WorkbenchButton>

                {isDownloading && (
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand-purple"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </div>
            )}

            <WorkbenchButton
              onClick={handleCheckForUpdates}
              disabled={isChecking || isDownloading}
              className="w-full h-10 gap-2"
            >
              <WorkbenchIcon name="codicon:refresh" size={16} className={isChecking ? 'animate-spin' : ''} />
              <span className="text-xs font-extrabold uppercase tracking-tight">
                {isChecking ? 'Checking...' : 'Check for Updates'}
              </span>
            </WorkbenchButton>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
});
