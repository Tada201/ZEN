import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CodeBlock } from './CodeBlock';
import { chatApi } from '@/api/chatApi';
import { persistFencedRepair } from '@/lib/richContentRepair';
import {
  DEFAULT_CHART_COLORS,
  MAX_CHART_CHARS,
  parseChartContent,
  type ChartParseResult,
  type ChartSpec,
} from '@/lib/chart';

interface ChartBlockProps {
  content: string;
  isStreaming?: boolean;
  /** Session + backend message id — when present, AI condensations are persisted. */
  chatId?: string;
  messageId?: string;
}

interface CondensedChart {
  baseCode: string;
  spec: ChartSpec;
}

export function ChartBlock({ content, isStreaming, chatId, messageId }: ChartBlockProps) {
  const [repairing, setRepairing] = useState(false);
  const [repairFailed, setRepairFailed] = useState<string | null>(null);
  // Self-healing: when the payload is oversized, the model condenses it and the
  // condensed spec replaces the broken one. `showOriginal` flips back to the
  // original oversized payload.
  const [condensed, setCondensed] = useState<CondensedChart | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const chartData = useMemo<ChartParseResult>(() => {
    if (isStreaming) return { spec: null, tooLarge: false };
    return parseChartContent(content);
  }, [content, isStreaming]);

  // If the underlying message content changed, drop any in-memory condensation.
  useEffect(() => {
    if (condensed && condensed.baseCode !== content) {
      setCondensed(null);
      setShowOriginal(false);
      setRepairFailed(null);
    }
  }, [content, condensed]);

  const renderSpec = condensed && !showOriginal ? condensed.spec : chartData.spec;

  const handleCondense = useCallback(async () => {
    if (repairing) return;
    setRepairing(true);
    setRepairFailed(null);
    try {
      const fixed = await chatApi.repairChart(
        content,
        `Chart data exceeds ${MAX_CHART_CHARS.toLocaleString()} characters — condense it while keeping the same chart type, title, axes, and series keys.`,
      );
      const parsed = parseChartContent(fixed);
      if (parsed.tooLarge) {
        setRepairFailed(
          `The model returned a chart that is still too large (limit ${MAX_CHART_CHARS.toLocaleString()} characters). Try again.`,
        );
        return;
      }
      if (!parsed.spec) {
        setRepairFailed('The model returned invalid chart JSON. Try again.');
        return;
      }

      // Persist the fix into the stored assistant message (content + execution
      // timeline + live store) so it survives app reloads; falls back to a
      // local-only condensation when context is missing or persistence fails.
      const persisted = await persistFencedRepair({
        chatId,
        messageId,
        lang: 'chart',
        code: content,
        fixed,
      });
      if (persisted) return; // store update re-renders the fixed chart

      setCondensed({ baseCode: content, spec: parsed.spec });
      setShowOriginal(false);
    } catch (err) {
      setRepairFailed(err instanceof Error ? err.message : 'Failed to condense the chart');
    } finally {
      setRepairing(false);
    }
  }, [repairing, content, chatId, messageId]);

  if (chartData.tooLarge && !(condensed && !showOriginal)) {
    return (
      <div className="my-3 space-y-1.5">
        <div className="flex flex-col gap-1 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span>Chart Too Large</span>
          </div>
          <p className="text-xs text-muted-foreground break-words whitespace-normal">
            Chart data exceeds {MAX_CHART_CHARS.toLocaleString()} characters — ask the
            model to summarize the data instead.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCondense}
              disabled={repairing}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {repairing ? 'Condensing with AI…' : 'Condense with AI'}
            </button>
            {condensed && (
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Show condensed chart
              </button>
            )}
          </div>
          {repairFailed && (
            <p className="text-xs text-destructive break-words whitespace-normal">{repairFailed}</p>
          )}
        </div>
        <div className="opacity-80">
          <CodeBlock code={content} language="json" />
        </div>
      </div>
    );
  }

  if (isStreaming || !renderSpec) {
    return <CodeBlock code={content} language="json" isStreaming={isStreaming} />;
  }

  const { type, data, keys, xAxis, colors = DEFAULT_CHART_COLORS, title } = renderSpec;

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground) / 0.1)" />
            <XAxis 
              dataKey={xAxis} 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} 
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background) / 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            {keys.map((key, index) => (
              <Bar key={key} dataKey={key} fill={colors[index % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground) / 0.1)" />
            <XAxis dataKey={xAxis} axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background) / 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            {keys.map((key, index) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[index % colors.length]} 
                strokeWidth={2} 
                dot={{ r: 4 }} 
                activeDot={{ r: 6 }} 
              />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--foreground) / 0.1)" />
            <XAxis dataKey={xAxis} axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background) / 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            {keys.map((key, index) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={colors[index % colors.length]} 
                fill={colors[index % colors.length]} 
                fillOpacity={0.2} 
              />
            ))}
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={keys[0]}
            >
              {data.map((_entry: unknown, index: number) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--background) / 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
          </PieChart>
        );
      default:
        return <div>Unsupported chart type: {type}</div>;
    }
  };

  return (
    <>
      <div className="my-3 p-3 bg-card/90 rounded-lg border border-border/40 shadow-sm overflow-hidden">
        {title && (
          <div className="mb-2 text-center font-bold text-sm text-foreground/80 tracking-tight">
            {title}
          </div>
        )}
        <div className="h-[240px] w-full text-muted-foreground/70 dark:text-muted-foreground">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>
      {condensed && !showOriginal && (
        <div className="my-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Condensed with AI
          </span>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Show original
          </button>
        </div>
      )}
    </>
  );
}
