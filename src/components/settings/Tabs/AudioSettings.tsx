import { InputControls } from "./audio/InputControls";
import { MicrophoneConfig } from "./audio/MicrophoneConfig";
import { OutputConfig } from "./audio/OutputConfig";

export function AudioSettings() {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-foreground">Audio</h3>
                <p className="text-[13px] text-muted-foreground">
                    Configure system input/output devices, mic testing, speech detection, and capture cleanup.
                </p>
            </div>

            <MicrophoneConfig />
            <OutputConfig />
            <InputControls />
        </div>
    );
}
