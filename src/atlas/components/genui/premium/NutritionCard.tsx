// Nutrition Card component

export function NutritionCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg max-w-xs text-primary-foreground font-mono text-xs">
      <div className="border-b-4 border-border pb-1.5 mb-2">
        <h4 className="text-lg font-black tracking-tighter uppercase leading-none">{data.name || 'Nutrition Facts'}</h4>
        <p className="text-[10px] text-primary-foreground mt-0.5">Serving Size: {data.servingSize || '1 container'}</p>
      </div>
      
      <div className="flex justify-between items-baseline border-b-2 border-border pb-1 mb-2">
        <span className="font-black text-sm uppercase">Calories</span>
        <span className="text-2xl font-black tracking-tighter leading-none">{data.calories || '0'}</span>
      </div>

      <div className="space-y-1.5 border-b-4 border-border pb-2 mb-2">
        <div className="flex justify-between border-b border-border pb-0.5">
          <span><strong className="text-primary-foreground">Total Fat</strong> {data.fat || '0'}g</span>
          <strong className="text-primary-foreground">{data.fatPercent || '0'}%</strong>
        </div>
        <div className="flex justify-between border-b border-border pb-0.5">
          <span><strong className="text-primary-foreground">Total Carb</strong> {data.carbs || '0'}g</span>
          <strong className="text-primary-foreground">{data.carbsPercent || '0'}%</strong>
        </div>
        <div className="flex justify-between pb-0.5">
          <span><strong className="text-primary-foreground">Protein</strong> {data.protein || '0'}g</span>
          <strong className="text-primary-foreground">--%</strong>
        </div>
      </div>

      {/* Macro Bars */}
      <div className="space-y-2 mt-3 pt-1">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground block">Macro split</span>
        <div className="w-full h-3 rounded-full bg-muted flex overflow-hidden">
          <div className="bg-amber-500 h-full transition-all" style={{ width: `${data.fatRatio || 20}%` }} title="Fat" />
          <div className="bg-primary h-full transition-all" style={{ width: `${data.carbsRatio || 50}%` }} title="Carbs" />
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${data.proteinRatio || 30}%` }} title="Protein" />
        </div>
      </div>
    </div>
  );
}
