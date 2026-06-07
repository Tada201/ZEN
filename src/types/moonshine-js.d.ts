declare module '@moonshine-ai/moonshine-js' {
  export interface TranscriberCallbacks {
    onModelLoadStarted(): void;
    onModelLoaded(): void;
    onTranscribeStarted(): void;
    onTranscribeStopped(): void;
    onTranscriptionUpdated(text: string): void;
    onTranscriptionCommitted(text: string): void;
    onSpeechStart(): void;
    onSpeechEnd(): void;
    onError(error: unknown): void;
  }

  export class Transcriber {
    constructor(
      modelURL: string,
      callbacks?: Partial<TranscriberCallbacks>,
      useVAD?: boolean,
      precision?: string,
    );
    attachStream(stream: MediaStream): void;
    start(): Promise<void>;
    stop(): void;
  }
}
