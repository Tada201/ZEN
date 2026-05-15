import React, { useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  Filler
} from 'chart.js';
import { Line, Bar, Pie, Radar, Doughnut, PolarArea } from 'react-chartjs-2';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/style';
import { BarChart3, Maximize2, Minimize2 } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartBlockProps {
  code: string;
  className?: string;
}

export function ChartBlock({ code, className }: ChartBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const chartRef = useRef<any>(null);

  const chartData = useMemo(() => {
    try {
      if (!code) return null;

      const jsonStr = code.trim().startsWith('{')
        ? code
        : code.substring(code.indexOf('{'), code.lastIndexOf('}') + 1);

      if (jsonStr.length < 2) return null;

      const parsed = JSON.parse(jsonStr);

      if (parsed.data && parsed.type) {
        return parsed;
      }

      return {
        type: parsed.type || 'line',
        data: parsed.data || parsed,
        options: parsed.options || {}
      };
    } catch {
      if (code.trim().endsWith('}')) {
        console.error('Failed to parse chart data');
      }
      return null;
    }
  }, [code]);

  const options: ChartOptions = useMemo(() => {
    const defaultOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: 'var(--color-muted-foreground)',
            font: {
              family: 'ui-monospace, monospace',
              size: 9
            },
            boxWidth: 12,
            padding: 8,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
          borderWidth: 1,
          titleColor: 'var(--color-foreground)',
          bodyColor: 'var(--color-muted-foreground)',
          titleFont: {
            family: 'ui-monospace, monospace',
            size: 9
          },
          bodyFont: {
            family: 'ui-monospace, monospace',
            size: 9
          },
          padding: 8,
          cornerRadius: 4
        }
      },
      scales: {
        x: {
          grid: {
            color: 'var(--color-border)',
            lineWidth: 0.5
          },
          ticks: {
            color: 'var(--color-muted-foreground)',
            font: {
              family: 'ui-monospace, monospace',
              size: 8
            }
          }
        },
        y: {
          grid: {
            color: 'var(--color-border)',
            lineWidth: 0.5
          },
          ticks: {
            color: 'var(--color-muted-foreground)',
            font: {
              family: 'ui-monospace, monospace',
              size: 8
            }
          }
        }
      }
    };
    return defaultOptions;
  }, []);

  if (!chartData || !chartData.data) {
    return (
      <div className={cn('card flex items-center justify-center min-h-[200px]', className)}>
        <div className="text-muted-foreground text-[10px] font-mono uppercase tracking-widest opacity-50">
          Invalid chart configuration
        </div>
      </div>
    );
  }

  const chartKey = `${chartData.type}-${isExpanded ? 'expanded' : 'compact'}`;

  const renderChart = () => {
    const props = {
      key: chartKey,
      ref: chartRef,
      data: chartData.data,
      options: { ...options, ...chartData.options }
    };

    switch (chartData.type) {
      case 'bar':
        return <Bar {...props} />;
      case 'pie':
        return <Pie {...props} />;
      case 'radar':
        return <Radar {...props} />;
      case 'doughnut':
        return <Doughnut {...props} />;
      case 'polarArea':
        return <PolarArea {...props} />;
      default:
        return <Line {...props} />;
    }
  };

  return (
    <div className={cn('card overflow-hidden my-6', className)}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
            {chartData.type?.toUpperCase() || 'CHART'} ANALYTICS
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="press h-6 w-6 p-0"
        >
          {isExpanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
        </Button>
      </div>

      {/* Chart Area */}
      <div className={cn(
        'transition-all duration-300',
        isExpanded ? 'p-6 h-[400px]' : 'p-4 h-[200px]'
      )}>
        {renderChart()}
      </div>
    </div>
  );
}