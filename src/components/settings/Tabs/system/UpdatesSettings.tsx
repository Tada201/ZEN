import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useUpdateStore } from '@/lib/stores/updateStore';
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
  const currentVersion = useUpdateStore(s => s.currentVersion);
  const initializeVersion = useUpdateStore(s => s.init);

  const formatDate = (ts: number | null) => ts ? new Date(ts).toLocaleString() : 'Never';

  useEffect(() => {
    void initializeVersion();
  }, [initializeVersion]);

  // Updater delivery remains disabled until native updater signing is configured.
  const updateAvailable = false;
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
              <span className="text-[12px] font-bold text-foreground">Automatic Updates</span>
              <span className="text-[11px] text-muted-foreground">Check for stable release updates automatically</span>
            </div>
            <WorkbenchSwitch
              checked={autoCheckEnabled}
              onCheckedChange={(checked) => updateSetting({ autoCheckEnabled: checked } as any)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-foreground">Beta Channel</span>
              <span className="text-[11px] text-muted-foreground">Opt-in for early access to experimental features</span>
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
            <div className="flex-1 p-4 bg-muted border border-border rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <WorkbenchIcon name="codicon:archive" size={14} className="text-muted-foreground" />
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Version</span>
              </div>
              <span className="text-2xl font-bold text-primary font-mono">v{currentVersion || '...'}</span>
            </div>

            <div className="flex-1 p-4 bg-muted border border-border rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <WorkbenchIcon name="codicon:history" size={14} className="text-muted-foreground" />
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Last Check</span>
              </div>
              <span className="text-sm font-bold text-foreground">{formatDate(lastCheck)}</span>
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
                  className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 overflow-hidden"
                >
                  <WorkbenchIcon name="codicon:error" size={16} className="text-destructive flex-shrink-0" />
                  <span className="text-xs font-bold text-red-100">Check Failed: {error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {updateAvailable && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                    <WorkbenchIcon name="codicon:check-all" size={20} className="text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold text-primary">Update Available</span>
                    <span className="text-xs text-primary/80 font-mono">A newer version is available</span>
                  </div>
                </div>

                <WorkbenchButton
                  variant="secondary"
                  onClick={() => {}}
                  disabled={isDownloading}
                  className="w-full h-10 gap-2 border-primary/30 hover:bg-primary/20 text-primary"
                >
                  <WorkbenchIcon name="codicon:cloud-download" size={16} />
                  <span className="text-xs font-extrabold uppercase tracking-tight">
                    {isDownloading ? `Downloading: ${downloadProgress}%` : `Install Update Now`}
                  </span>
                </WorkbenchButton>

                {isDownloading && (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
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
