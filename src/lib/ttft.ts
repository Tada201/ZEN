// TTFT Timing Instrumentation
// Inspired by Atomic-Chat's ttft-timing.ts

export type TtftMarker = 
  | 'alpha'           // user submits
  | 'dbInsert'        // user msg persisted
  | 'providerReady'   // LLM provider resolved
  | 'llmInvoked'      // first token request sent
  | 'firstChunk'      // first SSE byte received in frontend
  | 'firstRender'     // first text visible to user
  | 'complete'        // streaming complete

interface TtftSession {
  markers: Partial<Record<TtftMarker, number>>;
  startTime: number;
}

const activeSessions: Record<string, TtftSession> = {};

export function ttftBegin(chatId: string): void {
  activeSessions[chatId] = {
    markers: { alpha: performance.now() },
    startTime: performance.now()
  };
  console.log(`[TTFT] Session ${chatId} started`);
}

export function ttftMark(chatId: string, marker: TtftMarker): void {
  const session = activeSessions[chatId];
  if (!session) return;
  
  // Only record the first time a marker is hit per session
  if (!session.markers[marker]) {
    session.markers[marker] = performance.now();
    const elapsed = session.markers[marker]! - session.startTime;
    console.log(`[TTFT] ${marker}: ${elapsed.toFixed(1)}ms`);
  }
}

export function ttftReport(chatId: string, reason: string): void {
  const session = activeSessions[chatId];
  if (!session) return;
  
  session.markers['complete'] = performance.now();
  
  console.group(`TTFT Report: ${chatId} (${reason})`);
  
  const markers = session.markers;
  const start = session.startTime;
  
  const formatTime = (time?: number) => time ? `${(time - start).toFixed(1)}ms` : 'N/A';
  
  console.table({
    '1. User Submitted (alpha)': formatTime(markers.alpha),
    '2. DB Persisted': formatTime(markers.dbInsert),
    '3. Provider Ready': formatTime(markers.providerReady),
    '4. LLM Invoked': formatTime(markers.llmInvoked),
    '5. First Chunk (Frontend)': formatTime(markers.firstChunk),
    '6. First Render Visible': formatTime(markers.firstRender),
    '7. Stream Complete': formatTime(markers.complete),
  });
  
  if (markers.firstRender && markers.alpha) {
    const totalTtft = markers.firstRender - markers.alpha;
    console.log(`%cTotal TTFT: ${totalTtft.toFixed(1)}ms`, 'color: #00FF9F; font-weight: bold; font-size: 14px');
  }
  
  console.groupEnd();
  
  // Clean up
  delete activeSessions[chatId];
}
