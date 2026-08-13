// Nutrition Card component

export function NutritionCard({ data }: { data: any }) {
  return (
    <div className="genui-card-surface grid w-full max-w-none min-w-0 gap-5 rounded-2xl border border-border bg-card p-5 font-mono text-xs text-primary-foreground shadow-lg md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <div className="border-b-4 border-border pb-2">
          <h4 className="text-lg font-black uppercase leading-none tracking-tighter">
            {data.name || "Nutrition Facts"}
          </h4>
          <p className="mt-1 text-[10px] text-primary-foreground">
            Serving Size: {data.servingSize || "1 container"}
          </p>
        </div>

        <div className="mt-3 flex items-baseline justify-between border-b-2 border-border pb-2">
          <span className="text-sm font-black uppercase">Calories</span>
          <span className="text-3xl font-black leading-none tracking-tighter">
            {data.calories || "0"}
          </span>
        </div>
      </div>

      <div>
        <div className="space-y-1.5 border-b-4 border-border pb-3">
          <div className="flex justify-between border-b border-border pb-1">
            <span>
              <strong>Total Fat</strong> {data.fat || "0"}g
            </span>
            <strong>{data.fatPercent || "0"}%</strong>
          </div>
          <div className="flex justify-between border-b border-border pb-1">
            <span>
              <strong>Total Carb</strong> {data.carbs || "0"}g
            </span>
            <strong>{data.carbsPercent || "0"}%</strong>
          </div>
          <div className="flex justify-between">
            <span>
              <strong>Protein</strong> {data.protein || "0"}g
            </span>
            <strong>--%</strong>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
            Macro split
          </span>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="Macro split: fat, carbohydrates, and protein"
          >
            <div className="h-full bg-amber-500" style={{ width: `${data.fatRatio || 20}%` }} title="Fat" />
            <div className="h-full bg-primary" style={{ width: `${data.carbsRatio || 50}%` }} title="Carbohydrates" />
            <div className="h-full bg-emerald-500" style={{ width: `${data.proteinRatio || 30}%` }} title="Protein" />
          </div>
        </div>
      </div>
    </div>
  );
}
