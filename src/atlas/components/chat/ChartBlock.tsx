import { useMemo } from 'react';
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

interface ChartBlockProps {
  content: string;
  isStreaming?: boolean;
}

interface ChartData {
  type: 'bar' | 'line' | 'area' | 'pie';
  data: any[];
  keys: string[];
  xAxis?: string;
  colors?: string[];
  title?: string;
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function ChartBlock({ content, isStreaming }: ChartBlockProps) {
  const chartData = useMemo<ChartData | null>(() => {
    if (isStreaming) return null;
    try {
      let cleaned = content.trim();
      // Remove any redundant leading/trailing backticks or markdown JSON formatting artifacts
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      return null;
    }
  }, [content, isStreaming]);

  if (isStreaming || !chartData || !chartData.data || !Array.isArray(chartData.data) || !chartData.keys || !Array.isArray(chartData.keys) || chartData.keys.length === 0) {
    return <CodeBlock code={content} language="json" />;
  }

  const { type, data, keys, xAxis, colors = DEFAULT_COLORS, title } = chartData;

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
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
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey={xAxis} axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey={xAxis} axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 11, opacity: 0.6 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
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
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
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
    <div className="my-6 p-6 bg-card/90 rounded-xl border border-border/40 shadow-sm overflow-hidden">
      {title && (
        <div className="mb-4 text-center font-bold text-sm text-foreground/80 tracking-tight">
          {title}
        </div>
      )}
      <div className="h-[300px] w-full text-zinc-600 dark:text-zinc-400">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
