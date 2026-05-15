export function RecipeCard({ title, description, ingredients = [], instructions = [], servings = 1 }: any) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm">
      <div className="p-6 border-b border-border/40 bg-muted/10">
        <h2 className="text-xl font-bold tracking-tight mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="p-6 space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Ingredients</h3>
            <span className="text-[10px] font-medium text-muted-foreground">Yields {servings} Servings</span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {ingredients.map((ing: any, i: number) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-bold text-primary/80">{ing.amount} {ing.unit}</span>
                <span className="text-muted-foreground">{ing.item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Instructions</h3>
          <ol className="space-y-4">
            {instructions.map((step: string, i: number) => (
              <li key={i} className="flex gap-4">
                <span className="flex-none h-6 w-6 rounded-full bg-muted border border-border/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
