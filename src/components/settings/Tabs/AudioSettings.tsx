import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Mic, Speaker, Volume2, Ear, Radio, Keyboard,
  Speech, Waves, Bell, Vibrate, Headphones
} from "lucide-react";

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

      <SettingsSection title="Audio Devices" icon={Headphones} description="Input and output hardware">
        <SettingsRow
          label="Microphone"
          description="Input device for speech capture"
          control={
            <Select value={settings["audio.microphone"] || "default"} onValueChange={v => onUpdate("audio.microphone", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Device</SelectItem>
                <SelectItem value="mic1">Built-in Microphone</SelectItem>
                <SelectItem value="mic2">Headset Microphone</SelectItem>
                <SelectItem value="mic3">External USB Mic</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Mic}
        />

        <SettingsRow
          label="Speaker"
          description="Output device for audio playback"
          control={
            <Select value={settings["audio.speaker"] || "default"} onValueChange={v => onUpdate("audio.speaker", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Device</SelectItem>
                <SelectItem value="spk1">Built-in Speakers</SelectItem>
                <SelectItem value="spk2">Headphones</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Speaker}
        />

        <SettingsRow
          label="Master Volume"
          description="Global audio output level"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Slider
                value={[parseInt(settings["audio.volume"] || "80")]}
                onValueChange={([v]) => onUpdate("audio.volume", String(v))}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                {settings["audio.volume"] || "80"}%
              </span>
            </div>
          }
          icon={Volume2}
        />
      </SettingsSection>

      <SettingsSection title="Speech Recognition" icon={Ear} description="Voice-to-text configuration">
        <SettingsRow
          label="Speech-to-Text"
          description="Enable voice input processing"
          control={
            <Switch
              checked={settings["audio.stt"] !== "false"}
              onCheckedChange={v => onUpdate("audio.stt", String(v))}
            />
          }
          icon={Radio}
        />

        <SettingsRow
          label="Voice Activity Detection"
          description="Auto-detect when you start speaking"
          control={
            <Switch
              checked={settings["audio.vad"] !== "false"}
              onCheckedChange={v => onUpdate("audio.vad", String(v))}
            />
          }
          icon={Waves}
        />

        <SettingsRow
          label="Push-to-Talk"
          description="Hold a key to activate voice input"
          control={
            <Switch
              checked={settings["audio.push-to-talk"] === "true"}
              onCheckedChange={v => onUpdate("audio.push-to-talk", String(v))}
            />
          }
          icon={Keyboard}
        />

        <SettingsRow
          label="STT Engine"
          description="Speech recognition backend"
          control={
            <Select value={settings["audio.stt-engine"] || "whisper"} onValueChange={v => onUpdate("audio.stt-engine", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whisper">Whisper (Local)</SelectItem>
                <SelectItem value="web-speech">Web Speech API</SelectItem>
                <SelectItem value="deepgram">Deepgram</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Mic}
        />
      </SettingsSection>

      <SettingsSection title="Voice Synthesis" icon={Speech} description="Text-to-speech output">
        <SettingsRow
          label="Text-to-Speech"
          description="Enable spoken responses"
          control={
            <Switch
              checked={settings["audio.tts"] !== "false"}
              onCheckedChange={v => onUpdate("audio.tts", String(v))}
            />
          }
          icon={Speech}
        />

        <SettingsRow
          label="TTS Engine"
          description="Voice synthesis backend"
          control={
            <Select value={settings["audio.tts-engine"] || "piper"} onValueChange={v => onUpdate("audio.tts-engine", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="piper">Piper (Local)</SelectItem>
                <SelectItem value="web-speech">Web Speech API</SelectItem>
                <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Headphones}
        />

        <SettingsRow
          label="Speaking Rate"
          description="Speed of voice output"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Slider
                value={[parseFloat(settings["audio.tts-rate"] || "1")]}
                onValueChange={([v]) => onUpdate("audio.tts-rate", v.toFixed(1))}
                min={0.5}
                max={2}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                {settings["audio.tts-rate"] || "1"}x
              </span>
            </div>
          }
          icon={Volume2}
        />
      </SettingsSection>

      <SettingsSection title="Sound Feedback" icon={Bell} description="Audio cues and notifications">
        <SettingsRow
          label="System Sounds"
          description="Play sounds for events and actions"
          control={
            <Switch
              checked={settings["audio.system-sounds"] !== "false"}
              onCheckedChange={v => onUpdate("audio.system-sounds", String(v))}
            />
          }
          icon={Bell}
        />

        <SettingsRow
          label="Notifications"
          description="Audio alerts for incoming messages"
          control={
            <Switch
              checked={settings["audio.notifications"] !== "false"}
              onCheckedChange={v => onUpdate("audio.notifications", String(v))}
            />
          }
          icon={Bell}
        />

        <SettingsRow
          label="Haptic Feedback"
          description="Vibration on key actions (if supported)"
          control={
            <Switch
              checked={settings["audio.haptic"] === "true"}
              onCheckedChange={v => onUpdate("audio.haptic", String(v))}
            />
          }
          icon={Vibrate}
        />
      </SettingsSection>
    </div>
  );
}
