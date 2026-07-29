import { useState } from "react";
import { Clock, Users, Flame, BookOpen, Check } from "lucide-react";

interface Ingredient {
  amount: string;
  unit: string;
  item: string;
}

interface RecipeData {
  name: string;
  cuisine?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: number | string;
  difficulty?: string;
  ingredients: Ingredient[];
  steps: string[];
  tags?: string[];
}

export function RecipeCard({ data }: { data: RecipeData }) {
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const name = data.name || "Recipe";
  const cuisine = data.cuisine || "Custom";
  const prepTime = data.prepTime || "--";
  const cookTime = data.cookTime || "--";
  const servings = data.servings || "--";
  const difficulty = data.difficulty || "Medium";
  const ingredients = data.ingredients || [];
  const steps = data.steps || [];
  const tags = data.tags || [];

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-primary">{cuisine} Cuisine</span>
          <h3 className="text-base font-semibold text-primary-foreground mt-0.5">{name}</h3>
        </div>
        {difficulty && (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted border border-border text-primary-foreground">
            {difficulty}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-5 border-y border-border py-3 text-primary-foreground">
        <div className="flex flex-col items-center justify-center p-1 bg-muted rounded-lg">
          <Clock className="w-3.5 h-3.5 mb-1 text-primary" />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Prep</span>
          <span className="text-xs font-semibold text-primary-foreground mt-0.5">{prepTime}</span>
        </div>
        <div className="flex flex-col items-center justify-center p-1 bg-muted rounded-lg">
          <Flame className="w-3.5 h-3.5 mb-1 text-primary" />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Cook</span>
          <span className="text-xs font-semibold text-primary-foreground mt-0.5">{cookTime}</span>
        </div>
        <div className="flex flex-col items-center justify-center p-1 bg-muted rounded-lg">
          <Users className="w-3.5 h-3.5 mb-1 text-primary" />
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Serves</span>
          <span className="text-xs font-semibold text-primary-foreground mt-0.5">{servings}</span>
        </div>
      </div>

      {ingredients.length > 0 && (
        <div className="mb-5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-primary" /> Ingredients
          </h4>
          <div className="space-y-1.5">
            {ingredients.map((ing, idx) => {
              const isChecked = !!checkedIngredients[idx];
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleIngredient(idx)}
                  className="flex items-center gap-2.5 w-full text-left py-1 hover:bg-muted rounded px-1.5 transition-colors group"
                >
                  <div
                    className={`flex items-center justify-center w-4 h-4 rounded border transition-all ${
                      isChecked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-transparent text-transparent group-hover:border-border"
                    }`}
                  >
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  </div>
                  <span className={`text-[12px] transition ${isChecked ? "line-through text-muted-foreground" : "text-primary-foreground"}`}>
                    <span className="font-semibold text-primary mr-1">
                      {ing.amount} {ing.unit}
                    </span>{" "}
                    {ing.item}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Directions</h4>
          <ol className="space-y-3">
            {steps.map((step, idx) => {
              const isCompleted = !!completedSteps[idx];
              return (
                <li
                  key={idx}
                  onClick={() => toggleStep(idx)}
                  className="flex items-start gap-3 cursor-pointer group py-0.5 rounded px-1 transition-colors"
                >
                  <div
                    className={`flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-[10px] font-bold transition-all border ${
                      isCompleted
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-muted text-primary-foreground group-hover:border-border group-hover:text-primary-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : idx + 1}
                  </div>
                  <p
                    className={`text-[12px] leading-relaxed transition ${
                      isCompleted ? "line-through text-muted-foreground" : "text-primary-foreground"
                    }`}
                  >
                    {step}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-5 pt-3.5 border-t border-border">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-primary-foreground border border-border"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
