import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { MermaidDiagram } from "@/atlas/components/chat/MermaidDiagram";
import type { VoiceStageChartBlock, VoiceStageEquationBlock, VoiceStageKrokiBlock } from "../voiceStageStore";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

export function BoardEquation({ block }: { block: VoiceStageEquationBlock }) {
  const html = useMemo(() => katex.renderToString(block.expression, {
    displayMode: true,
    throwOnError: false,
    strict: "warn",
    trust: false,
    output: "htmlAndMathml",
  }), [block.expression]);

  return (
    <div className="flex min-h-full min-w-0 flex-col items-center justify-center overflow-hidden p-4">
      {block.title && <div className="mb-3 text-xs font-semibold text-white/70">{block.title}</div>}
      <div
        className="max-w-full text-white [&_.katex-display]:m-0 [&_.katex-display]:max-w-full [&_.katex-display]:overflow-hidden"
        // KaTeX generates this HTML with trust disabled; model input is never interpreted as raw HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export function BoardChart({ block }: { block: VoiceStageChartBlock }) {
  const data = useMemo(() => ({
    labels: block.points.map((point) => point.label),
    datasets: [{
      label: block.title || "Value",
      data: block.points.map((point) => point.value),
      borderColor: "rgba(255,255,255,0.9)",
      backgroundColor: "rgba(255,255,255,0.18)",
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
    }],
  }), [block.points, block.title]);
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: Boolean(block.title), labels: { color: "rgba(255,255,255,0.7)" } } },
    scales: {
      x: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.06)" } },
      y: { ticks: { color: "rgba(255,255,255,0.55)" }, grid: { color: "rgba(255,255,255,0.08)" } },
    },
  }), [block.title]);

  return (
    <div className="h-full min-h-0 p-3">
      {block.chartType === "line" ? <Line data={data} options={options} /> : <Bar data={data} options={options} />}
    </div>
  );
}

export function BoardDiagram({ block }: { block: VoiceStageKrokiBlock }) {
  if (block.diagram.toLowerCase() === "mermaid") {
    return <div className="h-full overflow-hidden [&>div]:my-0 [&_svg]:max-h-full [&_svg]:max-w-full"><MermaidDiagram code={block.content} /></div>;
  }
  return (
    <div className="h-full overflow-hidden rounded-lg border border-white/[0.04]">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-white/45">{block.title || block.diagram}</div>
      <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] text-white/60">{block.content}</pre>
    </div>
  );
}
