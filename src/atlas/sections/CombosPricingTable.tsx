import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoCard } from "../Section";

const PRICING_TIERS = [
  { name: "Starter", price: "$0", features: ["3 projects", "Community support", "Basic analytics"] },
  { name: "Pro", price: "$12", features: ["Unlimited projects", "Priority support", "Custom themes", "Team seats"], highlight: true },
  { name: "Enterprise", price: "Custom", features: ["SSO & SAML", "Dedicated support", "SLA", "On-premise option"] },
];

export function CombosPricingTable() {
  return (
    <DemoCard
      label="Pricing Table"
      selection={{
        id: "cb-pricing", name: "Pricing Table", category: "Combos",
        variants: ["3-tier"],
        jsx: `<div className="grid grid-cols-3 gap-4">\n  <PricingCard tier="Starter" price="$0" />\n</div>`,
      }}
      className="md:col-span-2 xl:col-span-3"
    >
      <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-3 gap-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-xl border p-4 ${tier.highlight ? "border-primary" : "border-border"}`}
            style={tier.highlight ? { boxShadow: "var(--shadow-accent)" } : {}}
          >
            {tier.highlight && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Popular</span>}
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tier.name}</div>
            <div className="mt-1 text-3xl font-bold">{tier.price}</div>
            <div className="text-[10px] text-muted-foreground">{tier.price === "Custom" ? "Contact sales" : "/mo"}</div>
            <ul className="mt-3 space-y-1.5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-1.5 text-xs">
                  <Check className="h-3.5 w-3.5 text-primary" /> {feature}
                </li>
              ))}
            </ul>
            <Button className="press mt-4 w-full" variant={tier.highlight ? "default" : "outline"} size="sm">
              Choose {tier.name}
            </Button>
          </div>
        ))}
      </div>
    </DemoCard>
  );
}
