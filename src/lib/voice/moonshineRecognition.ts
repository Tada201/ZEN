export interface MoonshineRecognitionCallbacks {
  onModelLoading: () => void;
  onModelReady: () => void;
  onStarted: () => void;
  onStopped: () => void;
  onInterim: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (error: unknown) => void;
}

export interface MoonshineRecognitionSession {
  start: (stream: MediaStream) => Promise<void>;
  stop: () => void;
}

export async function createMoonshineRecognition(
  callbacks: MoonshineRecognitionCallbacks,
): Promise<MoonshineRecognitionSession> {
  const { Transcriber } = await import('@moonshine-ai/moonshine-js');
  const transcriber = new Transcriber(
    'model/tiny',
    {
      onModelLoadStarted: callbacks.onModelLoading,
      onModelLoaded: callbacks.onModelReady,
      onTranscribeStarted: callbacks.onStarted,
      onTranscribeStopped: callbacks.onStopped,
      onTranscriptionUpdated: callbacks.onInterim,
      onTranscriptionCommitted: callbacks.onCommitted,
      onError: callbacks.onError,
    },
    true,
    'quantized',
  );

  return {
    async start(stream) {
      transcriber.attachStream(stream);
      await transcriber.start();
    },
    stop() {
      transcriber.stop();
    },
  };
}
