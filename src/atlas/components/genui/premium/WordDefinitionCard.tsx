import { BookOpen } from "lucide-react";

interface DefinitionEntry {
  pos: string; // Part of Speech (e.g. noun, verb)
  definition: string;
  examples?: string[];
}

interface WordDefinitionData {
  word: string;
  phonetic?: string;
  language?: string;
  entries: DefinitionEntry[];
  etymology?: string;
  synonyms?: string[];
}

export function WordDefinitionCard({ data }: { data: WordDefinitionData }) {
  const word = data.word || "Word";
  const phonetic = data.phonetic;
  const language = data.language || "en";
  const entries = data.entries || [];
  const etymology = data.etymology;
  const synonyms = data.synonyms || [];

  return (
    <div className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-lg font-bold text-primary-foreground tracking-tight">{word}</h3>
            {phonetic && (
              <span className="text-[11px] font-mono text-primary/70">{phonetic}</span>
            )}
          </div>
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary-foreground/30">
            Language: {language}
          </span>
        </div>
        <BookOpen className="w-5 h-5 text-primary-foreground/20" />
      </div>

      <div className="space-y-4 flex-1">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex flex-col">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                {entry.pos}
              </span>
              <div className="flex-1 h-px bg-card/[0.06]" />
            </div>

            <p className="text-[12px] text-primary-foreground/80 leading-relaxed font-sans pl-1">
              {entry.definition}
            </p>

            {entry.examples && entry.examples.length > 0 && (
              <ul className="pl-4 mt-1.5 space-y-1 list-disc text-primary-foreground/40 text-[11px] italic">
                {entry.examples.map((ex, exIdx) => (
                  <li key={exIdx} className="leading-relaxed">
                    "{ex}"
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {(etymology || synonyms.length > 0) && (
        <div className="mt-5 pt-3.5 border-t border-border/[0.06] space-y-2 text-[10px] font-mono">
          {etymology && (
            <div className="text-primary-foreground/40 leading-relaxed">
              <span className="text-primary-foreground/20 uppercase tracking-wider block mb-0.5">Etymology</span>
              {etymology}
            </div>
          )}
          {synonyms.length > 0 && (
            <div className="text-primary-foreground/40">
              <span className="text-primary-foreground/20 uppercase tracking-wider block mb-1">Synonyms</span>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {synonyms.map((syn) => (
                  <span
                    key={syn}
                    className="text-[9px] px-2 py-0.5 rounded-full bg-card/[0.04] text-primary-foreground/60 border border-border/[0.02]"
                  >
                    {syn}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
