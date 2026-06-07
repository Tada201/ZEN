type AppendVoiceLog = (msg: string, status?: 'OK' | 'ERR') => void;

export async function getVoiceInputStream({
    appendLog,
    autoGainControl,
    echoCancellation,
    noiseSuppression,
    selectedMic,
}: {
    appendLog: AppendVoiceLog;
    autoGainControl: boolean;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    selectedMic: string;
}) {
    const baseConstraints: MediaTrackConstraints = { noiseSuppression, echoCancellation, autoGainControl };
    if (!selectedMic || selectedMic === 'default') return navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: { ...baseConstraints, deviceId: { exact: selectedMic } },
        });
    } catch (error) {
        appendLog(`Selected microphone unavailable, using system default: ${error instanceof Error ? error.message : String(error)}`, 'ERR');
        return navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
    }
}
