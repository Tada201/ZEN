import { useCallback, useEffect } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

class TacticalAudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private compressor: DynamicsCompressorNode | null = null;

    private init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(40, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
        this.compressor.connect(this.ctx.destination);
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.compressor);
        const { masterVolume } = useSettingsStore.getState();
        this.updateVolume(masterVolume ?? 1.0);
    }

    public updateVolume(volume: number) {
        if (!this.masterGain || !this.ctx) return;
        this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }

    private resume() {
        if (this.ctx?.state === 'suspended') this.ctx.resume();
    }

    public play(type: 'hover' | 'click' | 'boot' | 'error' | 'success' | 'typing' | 'mechanical' | 'panel', options: { gain?: number; frequency?: number } = {}) {
        this.init();
        this.resume();
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const { gain: optGain, frequency: optFreq } = options;
        const { isMuted, masterVolume } = useSettingsStore.getState();
        if (isMuted) return;

        switch (type) {
            case 'hover': {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(optFreq ?? 1200, now);
                osc.frequency.exponentialRampToValueAtTime((optFreq ?? 1200) * 0.66, now + 0.04);
                gain.gain.setValueAtTime((optGain ?? 0.1) * masterVolume, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.04);
                break;
            }
            case 'click': {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(optFreq ?? 220, now);
                osc.frequency.exponentialRampToValueAtTime((optFreq ?? 220) * 0.27, now + 0.05);
                gain.gain.setValueAtTime((optGain ?? 0.2) * masterVolume, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            }
            case 'error': {
                const osc1 = this.ctx.createOscillator();
                const osc2 = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc1.type = 'square';
                osc2.type = 'square';
                osc1.frequency.setValueAtTime(110, now);
                osc2.frequency.setValueAtTime(115, now);
                gain.gain.setValueAtTime((optGain ?? 0.15) * masterVolume, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.masterGain);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.3);
                osc2.stop(now + 0.3);
                break;
            }
            case 'success': {
                [523.25, 659.25, 783.99].forEach((freq, i) => {
                    const osc = this.ctx!.createOscillator();
                    const gain = this.ctx!.createGain();
                    const startTime = now + (i * 0.05);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, startTime);
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime((optGain ?? 0.1) * masterVolume, startTime + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
                    osc.connect(gain);
                    gain.connect(this.masterGain!);
                    osc.start(startTime);
                    osc.stop(startTime + 0.3);
                });
                break;
            }
            case 'boot': {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(optFreq ?? 20, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 1.2);
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(100, now);
                filter.frequency.exponentialRampToValueAtTime(2000, now + 1.2);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime((optGain ?? 0.2) * masterVolume, now + 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 1.2);
                break;
            }
            default: break;
        }
    }
}

const engine = new TacticalAudioEngine();

export function useSound() {
    const masterVolume = useSettingsStore(s => s.masterVolume ?? 1.0);
    const isMuted = useSettingsStore(s => s.isMuted ?? false);

    useEffect(() => {
        engine.updateVolume(masterVolume);
    }, [masterVolume]);

    const play = useCallback((type: 'hover' | 'click' | 'boot' | 'error' | 'success' | 'typing' | 'mechanical' | 'panel', options: { gain?: number; frequency?: number } = {}) => {
        if (isMuted) return;
        engine.play(type, options);
    }, [isMuted]);

    return { play };
}