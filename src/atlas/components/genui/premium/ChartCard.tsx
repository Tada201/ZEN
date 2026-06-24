import { BarChart, PieChart } from "lucide-react";

interface Dataset {
  label: string;
  data: number[];
  color?: string;
}

interface ChartData {
  title: string;
  chartType: "bar" | "line" | "pie" | "area" | "scatter" | string;
  labels: string[];
  datasets: Dataset[];
  xLabel?: string;
  yLabel?: string;
  unit?: string;
}

export function ChartCard({ data }: { data: ChartData }) {
  const title = data.title || "Data Visualization";
  const chartType = (data.chartType || "bar").toLowerCase();
  const labels = data.labels || [];
  const datasets = data.datasets || [];
  const unit = data.unit || "";

  // Helper values
  const maxVal = Math.max(...datasets.flatMap((d) => d.data), 10);
  const minVal = Math.min(...datasets.flatMap((d) => d.data), 0);
  const range = maxVal - minVal;

  const getSVGCoords = (val: number, idx: number, total: number, width: number, height: number) => {
    const x = total > 1 ? (idx / (total - 1)) * (width - 40) + 20 : width / 2;
    const y = height - ((val - minVal) / range) * (height - 30) - 15;
    return { x, y };
  };

  const colors = [
    "hsl(var(--primary))",
    "#a78bfa",
    "#60a5fa",
    "#34d399",
    "#f472b6",
    "#f59e0b",
  ];

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        {chartType === "pie" ? (
          <PieChart className="w-4 h-4 text-primary" />
        ) : (
          <BarChart className="w-4 h-4 text-primary" />
        )}
      </div>

      <div className="w-full h-48 relative flex items-center justify-center bg-white/[0.01] rounded-xl border border-white/[0.04] p-3 overflow-hidden">
        {datasets.length === 0 || labels.length === 0 ? (
          <span className="text-[10px] font-mono text-white/30">No data provided</span>
        ) : chartType === "pie" ? (
          // SVG Pie/Donut Chart
          <svg viewBox="0 0 100 100" className="w-36 h-36">
            {(() => {
              const totalSum = datasets[0].data.reduce((a, b) => a + b, 0);
              let accumulatedAngle = 0;
              return datasets[0].data.map((val, idx) => {
                const percentage = totalSum > 0 ? val / totalSum : 0;
                const angle = percentage * 360;
                const radiansStart = ((accumulatedAngle - 90) * Math.PI) / 180;
                accumulatedAngle += angle;
                const radiansEnd = ((accumulatedAngle - 90) * Math.PI) / 180;

                const x1 = 50 + 40 * Math.cos(radiansStart);
                const y1 = 50 + 40 * Math.sin(radiansStart);
                const x2 = 50 + 40 * Math.cos(radiansEnd);
                const y2 = 50 + 40 * Math.sin(radiansEnd);

                const largeArcFlag = angle > 180 ? 1 : 0;
                const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                const color = datasets[0].color || colors[idx % colors.length];

                return (
                  <path
                    key={idx}
                    d={pathData}
                    fill={color}
                    className="hover:opacity-95 transition-opacity cursor-pointer border border-black/20"
                  >
                    <title>{`${labels[idx]}: ${val}${unit}`}</title>
                  </path>
                );
              });
            })()}
            <circle cx="50" cy="50" r="22" fill="#0c0c0e" />
          </svg>
        ) : (
          // SVG Line/Bar/Area Chart
          <svg className="w-full h-full" viewBox="0 0 300 150" preserveAspectRatio="none">
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => (
              <line
                key={idx}
                x1="10"
                y1={15 + p * 110}
                x2="290"
                y2={15 + p * 110}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
            ))}

            {datasets.map((dataset, dIdx) => {
              const color = dataset.color || colors[dIdx % colors.length];

              if (chartType === "line" || chartType === "area") {
                const points = dataset.data.map((val, idx) =>
                  getSVGCoords(val, idx, dataset.data.length, 300, 150)
                );
                const pathD = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

                const areaD =
                  points.length > 0
                    ? `${pathD} L ${points[points.length - 1].x} 135 L ${points[0].x} 135 Z`
                    : "";

                return (
                  <g key={dIdx}>
                    {chartType === "area" && (
                      <path
                        d={areaD}
                        fill={color}
                        fillOpacity="0.12"
                        className="transition-all duration-300"
                      />
                    )}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />
                    {points.map((p, pIdx) => (
                      <circle
                        key={pIdx}
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill="#0c0c0e"
                        stroke={color}
                        strokeWidth="1.5"
                      />
                    ))}
                  </g>
                );
              }

              // Default: Bar Chart
              const barWidth = Math.max(10, 180 / (dataset.data.length * datasets.length));
              return dataset.data.map((val, idx) => {
                const coords = getSVGCoords(val, idx, dataset.data.length, 300, 150);
                const xOffset = coords.x - (datasets.length * barWidth) / 2 + dIdx * barWidth;
                const barHeight = Math.max(2, 135 - coords.y);

                return (
                  <rect
                    key={idx}
                    x={xOffset}
                    y={coords.y}
                    width={barWidth - 2}
                    height={barHeight}
                    fill={color}
                    rx="1.5"
                    className="hover:opacity-85 transition-opacity cursor-pointer"
                  />
                );
              });
            })}
          </svg>
        )}
      </div>

      {/* Legends & Labels */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 text-[10px] font-mono text-white/50 border-t border-white/[0.04] pt-2.5">
        {chartType === "pie"
          ? labels.map((label, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: datasets[0].color || colors[idx % colors.length],
                  }}
                />
                <span>
                  {label}: {datasets[0].data[idx]}
                  {unit}
                </span>
              </div>
            ))
          : datasets.map((dataset, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: dataset.color || colors[idx % colors.length] }}
                />
                <span>{dataset.label}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
