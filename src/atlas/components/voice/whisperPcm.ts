const TARGET_SAMPLE_RATE = 16000;

export const WHISPER_AUDIO_LIMITS = {
    minPttAudioBytes: 3200,
    minRms: 0.00005,
    minPeak: 0.0003,
};

export function convertChunksToWhisperPcm(chunks: Float32Array[], nativeSampleRate: number, micVolume: number) {
    if (chunks.length === 0) return null;
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }

    let samples16k: Float32Array;
    if (nativeSampleRate !== TARGET_SAMPLE_RATE) {
        const ratio = nativeSampleRate / TARGET_SAMPLE_RATE;
        const newLength = Math.floor(totalLength / ratio);
        samples16k = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) samples16k[i] = merged[Math.floor(i * ratio)];
    } else {
        samples16k = merged;
    }

    const pcmBytes = new Uint8Array(samples16k.length * 2);
    const view = new DataView(pcmBytes.buffer);
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < samples16k.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples16k[i] * micVolume));
        const abs = Math.abs(clamped);
        if (abs > peak) peak = abs;
        sumSq += clamped * clamped;
        view.setInt16(i * 2, Math.floor(clamped * 32767), true);
    }

    return {
        bytes: Array.from(pcmBytes),
        rms: Math.sqrt(sumSq / Math.max(1, samples16k.length)),
        peak,
        durationMs: Math.round((samples16k.length / TARGET_SAMPLE_RATE) * 1000),
    };
}
