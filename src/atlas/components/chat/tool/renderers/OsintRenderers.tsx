import { Panel, SummaryLine, MoreRow, asRecord, num, str, arr } from "./primitives";
import type { RendererContext } from "./registry";

const MAX_ROWS = 5;

/* ── Earthquakes ──────────────────────────────────────────────── */
// Output: { summary, count, earthquakes: [{ magnitude, place, depth, time, tsunami, alert, lat, lon }] }
export function EarthquakeList({ output }: RendererContext) {
  const record = asRecord(output);
  const quakes = arr(record.earthquakes);
  if (quakes.length === 0) return null;

  const rows = quakes.slice(0, MAX_ROWS).map(asRecord);
  return (
    <div className="flex flex-col gap-2">
      <SummaryLine text={str(record.summary)} />
      <Panel label={`${quakes.length} earthquakes`}>
        <div className="flex flex-col gap-1.5">
          {rows.map((q, index) => {
            const mag = num(q.magnitude);
            const strong = (mag ?? 0) >= 5.0;
            return (
              <div key={str(q.id) || index} className="flex items-center gap-2 min-w-0">
                <span
                  className={
                    strong
                      ? "shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] tabular-nums text-destructive"
                      : "shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[11px] tabular-nums text-foreground"
                  }
                >
                  M{mag !== undefined ? mag.toFixed(1) : "?"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{str(q.place)}</span>
                {num(q.depth) !== undefined && (
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{num(q.depth)!.toFixed(0)}km</span>
                )}
                {q.tsunami === true && (
                  <span className="shrink-0 rounded bg-warning/10 px-1 py-0.5 text-[10px] text-warning">tsunami</span>
                )}
              </div>
            );
          })}
          <MoreRow hidden={quakes.length - rows.length} />
        </div>
      </Panel>
    </div>
  );
}

/* ── Military aircraft ────────────────────────────────────────── */
// Output: { summary, count, aircraft: [{ flight, hex, aircraft_type, alt_baro, ground_speed, ... }] }
export function AircraftList({ output }: RendererContext) {
  const record = asRecord(output);
  const aircraft = arr(record.aircraft);
  if (aircraft.length === 0) return null;

  const rows = aircraft.slice(0, MAX_ROWS).map(asRecord);
  return (
    <div className="flex flex-col gap-2">
      <SummaryLine text={str(record.summary)} />
      <Panel label={`${aircraft.length} aircraft`}>
        <div className="flex flex-col gap-1.5">
          {rows.map((a, index) => {
            const callsign = str(a.flight).trim() || str(a.hex);
            const alt = num(a.alt_baro);
            const speed = num(a.ground_speed);
            return (
              <div key={str(a.hex) || index} className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 font-mono text-[11px] text-foreground">{callsign || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {str(a.aircraft_type) || "Unknown type"}
                </span>
                {alt !== undefined && (
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{alt.toFixed(0)}ft</span>
                )}
                {speed !== undefined && (
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{speed.toFixed(0)}km/h</span>
                )}
              </div>
            );
          })}
          <MoreRow hidden={aircraft.length - rows.length} />
        </div>
      </Panel>
    </div>
  );
}

/* ── Route ────────────────────────────────────────────────────── */
// Output: { status, provider, distance_km, duration_minutes, summary, steps_count }
export function RouteCard({ input, output }: RendererContext) {
  const record = asRecord(output);
  const distance = str(record.distance_km);
  const duration = str(record.duration_minutes);
  if (!distance && !duration && !str(record.summary)) return null;

  const inputRecord = asRecord(input);
  const origin = str(inputRecord.origin);
  const destination = str(inputRecord.destination);

  return (
    <Panel label="Route">
      {(origin || destination) && (
        <div className="mb-1 truncate text-[12px] text-foreground">
          {origin || "start"} <span className="text-muted-foreground">→</span> {destination || "destination"}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {distance && <span className="text-[12px] tabular-nums text-foreground">{distance} km</span>}
        {duration && <span className="text-[12px] tabular-nums text-foreground">{duration} min</span>}
        {str(record.provider) && (
          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{str(record.provider)}</span>
        )}
        {num(record.steps_count) !== undefined && (
          <span className="text-[10px] text-muted-foreground">{num(record.steps_count)} steps</span>
        )}
      </div>
    </Panel>
  );
}

/* ── Geocode ──────────────────────────────────────────────────── */
// Output: { count, results: [{ display_name, lat, lon, place_type, importance }] }
export function GeocodeList({ output }: RendererContext) {
  const record = asRecord(output);
  const results = arr(record.results);
  if (results.length === 0) return null;

  const rows = results.slice(0, MAX_ROWS).map(asRecord);
  return (
    <Panel label={`${results.length} places`}>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, index) => {
          const lat = num(r.lat);
          const lon = num(r.lon);
          return (
            <div key={str(r.display_name) || index} className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{str(r.display_name)}</span>
                {str(r.place_type) && (
                  <span className="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {str(r.place_type)}
                  </span>
                )}
              </div>
              {lat !== undefined && lon !== undefined && (
                <div className="font-mono text-[10px] text-muted-foreground">
                  {lat.toFixed(4)}, {lon.toFixed(4)}
                </div>
              )}
            </div>
          );
        })}
        <MoreRow hidden={results.length - rows.length} />
      </div>
    </Panel>
  );
}
