import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface AudioSettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function AudioSettings({ settings, onUpdate }: AudioSettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Audio</h3>
        <p className="text-[13px] text-muted-foreground">Configure audio devices, speech, and sound preferences.</p>
      </div>

      <SettingsSection title="Audio Devices" icon="lucide:headphones" description="Input and output hardware">
        <SettingsRow
          label="Microphone"
          description="Input device for speech capture"
          control={
            <WorkbenchSelect
              value={settings["audio.microphone"] || "default"}
              onValueChange={v => onUpdate("audio.microphone", v)}
              options={[
                { value: "default", label: "Default Device" },
                { value: "mic1", label: "Built-in Microphone" },
                { value: "mic2", label: "Headset Microphone" },
                { value: "mic3", label: "External USB Mic" },
              ]}
              width={140}
            />
          }
          icon="lucide:mic"
        />

        <SettingsRow
          label="Speaker"
          description="Output device for audio playback"
          control={
            <WorkbenchSelect
              value={settings["audio.speaker"] || "default"}
              onValueChange={v => onUpdate("audio.speaker", v)}
              options={[
                { value: "default", label: "Default Device" },
                { value: "spk1", label: "Built-in Speakers" },
                { value: "spk2", label: "Headphones" },
              ]}
              width={140}
            />
          }
          icon="lucide:speaker"
        />

        <SettingsRow
          label="Master Volume"
          description="Global audio output level"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchIcon name="lucide:volume-2" className="text-muted-foreground shrink-0" size={14} />
              <WorkbenchSlider
                value={[parseInt(settings["audio.volume"] || "80")]}
                onValueChange={([v]) => onUpdate("audio.volume", String(v))}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right font-mono">
                {settings["audio.volume"] || "80"}%
              </span>
            </div>
          }
          icon="lucide:volume-2"
        />
      </SettingsSection>

      <SettingsSection title="Speech Recognition" icon="lucide:ear" description="Voice-to-text configuration">
        <SettingsRow
          label="Speech-to-Text"
          description="Enable voice input processing"
          control={
            <WorkbenchSwitch
              checked={settings["audio.stt"] !== "false"}
              onCheckedChange={v => onUpdate("audio.stt", String(v))}
            />
          }
          icon="lucide:radio"
        />

        <SettingsRow
          label="Voice Activity Detection"
          description="Auto-detect when you start speaking"
          control={
            <WorkbenchSwitch
              checked={settings["audio.vad"] !== "false"}
              onCheckedChange={v => onUpdate("audio.vad", String(v))}
            />
          }
          icon="lucide:waves"
        />

        <SettingsRow
          label="Push-to-Talk"
          description="Hold a key to activate voice input"
          control={
            <WorkbenchSwitch
              checked={settings["audio.push-to-talk"] === "true"}
              onCheckedChange={v => onUpdate("audio.push-to-talk", String(v))}
            />
          }
          icon="lucide:keyboard"
        />

        <SettingsRow
          label="STT Engine"
          description="Speech recognition backend"
          control={
            <WorkbenchSelect
              value={settings["audio.stt-engine"] || "whisper"}
              onValueChange={v => onUpdate("audio.stt-engine", v)}
              options={[
                { value: "whisper", label: "Whisper (Local)" },
                { value: "web-speech", label: "Web Speech API" },
                { value: "deepgram", label: "Deepgram" },
              ]}
              width={140}
            />
          }
          icon="lucide:mic"
        />
      </SettingsSection>

      <SettingsSection title="Voice Synthesis" icon="lucide:speech" description="Text-to-speech output">
        <SettingsRow
          label="Text-to-Speech"
          description="Enable spoken responses"
          control={
            <WorkbenchSwitch
              checked={settings["audio.tts"] !== "false"}
              onCheckedChange={v => onUpdate("audio.tts", String(v))}
            />
          }
          icon="lucide:speech"
        />

        <SettingsRow
          label="TTS Engine"
          description="Voice synthesis backend"
          control={
            <div className="flex flex-col gap-1.5 items-end">
              <WorkbenchSelect
                value={settings["audio.tts-engine"] || "piper"}
                onValueChange={v => onUpdate("audio.tts-engine", v)}
                options={[
                  { value: "piper", label: "Piper (Local)" },
                  { value: "web-speech", label: "Web Speech API" },
                  { value: "elevenlabs", label: "ElevenLabs" },
                  { value: "nine_router", label: "9Router TTS (Proxy)" },
                ]}
                width={140}
              />
              {settings["audio.tts-engine"] === "nine_router" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 font-bold uppercase tracking-wider text-right animate-in fade-in duration-300">
                  Offline Voice Capture Configured
                </span>
              )}
            </div>
          }
          icon="lucide:headphones"
        />

        <SettingsRow
          label="Speaking Rate"
          description="Speed of voice output"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchSlider
                value={[parseFloat(settings["audio.tts-rate"] || "1")]}
                onValueChange={([v]) => onUpdate("audio.tts-rate", v.toFixed(1))}
                min={0.5}
                max={2}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right font-mono">
                {settings["audio.tts-rate"] || "1"}x
              </span>
            </div>
          }
          icon="lucide:volume-2"
        />
      </SettingsSection>

      <SettingsSection title="Sound Feedback" icon="lucide:bell" description="Audio cues and notifications">
        <SettingsRow
          label="System Sounds"
          description="Play sounds for events and actions"
          control={
            <WorkbenchSwitch
              checked={settings["audio.system-sounds"] !== "false"}
              onCheckedChange={v => onUpdate("audio.system-sounds", String(v))}
            />
          }
          icon="lucide:bell"
        />

        <SettingsRow
          label="Notifications"
          description="Audio alerts for incoming messages"
          control={
            <WorkbenchSwitch
              checked={settings["audio.notifications"] !== "false"}
              onCheckedChange={v => onUpdate("audio.notifications", String(v))}
            />
          }
          icon="lucide:bell"
        />

        <SettingsRow
          label="Haptic Feedback"
          description="Vibration on key actions (if supported)"
          control={
            <WorkbenchSwitch
              checked={settings["audio.haptic"] === "true"}
              onCheckedChange={v => onUpdate("audio.haptic", String(v))}
            />
          }
          icon="lucide:vibrate"
        />
      </SettingsSection>
    </div>
  );
}
