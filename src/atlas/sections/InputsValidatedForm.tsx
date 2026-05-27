import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DemoCard } from "../Section";

const signupSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});

type SignupForm = z.infer<typeof signupSchema>;

export function InputsValidatedForm() {
  const {
    register, handleSubmit, control, formState: { errors, isSubmitting, isSubmitSuccessful }, reset,
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema), mode: "onBlur" });

  const onSubmit = async (data: SignupForm) => {
    await new Promise((r) => setTimeout(r, 700));
    toast.success(`Welcome, ${data.name}!`);
    reset();
  };

  return (
    <DemoCard
      label="Validated form (RHF + Zod)"
      selection={{
        id: "i-rhf", name: "Sign-up Form (react-hook-form + zod)", category: "Inputs & Forms",
        variants: ["validated", "schema-driven"],
        jsx: `const schema = z.object({\n  email: z.string().email(),\n  password: z.string().min(8),\n});\nconst { register, handleSubmit, formState } =\n  useForm({ resolver: zodResolver(schema) });`,
      }}
      className="md:col-span-2 xl:col-span-2"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        noValidate
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rhf-name">Name</Label>
          <Input id="rhf-name" {...register("name")} aria-invalid={!!errors.name} aria-describedby="rhf-name-err" />
          {errors.name && <p id="rhf-name-err" role="alert" className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rhf-email">Email</Label>
          <Input id="rhf-email" type="email" {...register("email")} aria-invalid={!!errors.email} aria-describedby="rhf-email-err" />
          {errors.email && <p id="rhf-email-err" role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rhf-pw">Password</Label>
          <Input id="rhf-pw" type="password" {...register("password")} aria-invalid={!!errors.password} aria-describedby="rhf-pw-err" />
          {errors.password && <p id="rhf-pw-err" role="alert" className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Controller
            control={control}
            name="terms"
            render={({ field }) => (
              <Checkbox
                id="rhf-terms"
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
                aria-invalid={!!errors.terms}
              />
            )}
          />
          <Label htmlFor="rhf-terms" className="text-xs font-normal leading-snug">
            I agree to the Terms of Service and Privacy Policy.
            {errors.terms && <span className="ml-1 text-destructive">{errors.terms.message}</span>}
          </Label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="press w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : isSubmitSuccessful ? "Done!" : "Create account"}
          </Button>
        </div>
      </form>
    </DemoCard>
  );
}
