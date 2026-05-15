import { useCallback, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle, Check, CheckCircle2, ChevronsUpDown, Eye, EyeOff,
  FileUp, Mail, UploadCloud, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DemoCard, Section } from "../Section";

const FRAMEWORKS = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "vite", label: "Vite" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "solid", label: "SolidStart" },
  { value: "expo", label: "Expo" },
];

const TAGS = [
  "design-system", "tailwind", "radix", "shadcn", "react", "typescript",
  "accessibility", "tokens", "motion", "dark-mode",
];

function passwordScore(s: string) {
  let n = 0;
  if (s.length >= 8) n++;
  if (s.length >= 12) n++;
  if (/[A-Z]/.test(s)) n++;
  if (/\d/.test(s)) n++;
  if (/[^A-Za-z0-9]/.test(s)) n++;
  return Math.min(n, 4);
}
const STRENGTH_LABELS = ["Too short", "Weak", "Okay", "Strong", "Excellent"];
const STRENGTH_COLORS = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-primary", "bg-[hsl(var(--success))]"];

const signupSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});
type SignupForm = z.infer<typeof signupSchema>;

/* ── Colour picker helpers ── */
const SWATCH_HUES = [0, 20, 40, 60, 120, 160, 200, 240, 270, 300, 330];

function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function InputsSection() {
  const [show, setShow] = useState(false);
  const [text, setText] = useState("Hello UI Zen — type to grow this textarea automatically as your message expands.");

  const [comboOpen, setComboOpen] = useState(false);
  const [framework, setFramework] = useState("vite");

  const [tags, setTags] = useState<string[]>(["tailwind", "shadcn"]);
  const [tagOpen, setTagOpen] = useState(false);
  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const [pwd, setPwd] = useState("Zen-1234");
  const score = passwordScore(pwd);

  const [otp, setOtp] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onPick = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 5));
  }, []);

  /* Range slider */
  const [range, setRange] = useState([20, 75]);

  /* Date picker */
  const [pickedDate, setPickedDate] = useState<Date | undefined>(new Date());

  /* Color picker */
  const [hue, setHue] = useState(220);
  const [sat, setSat] = useState(80);
  const [lit, setLit] = useState(55);
  const hexColor = hslToHex(hue, sat, lit);

  /* RHF + Zod form */
  const {
    register, handleSubmit, control, formState: { errors, isSubmitting, isSubmitSuccessful }, reset,
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema), mode: "onBlur" });

  const onSubmit = async (data: SignupForm) => {
    await new Promise((r) => setTimeout(r, 700));
    toast.success(`Welcome, ${data.name}!`);
    reset();
  };

  return (
    <Section id="inputs" title="Inputs & Forms" description="Fields, controls, validation, and modern form patterns.">
      <DemoCard
        label="Text"
        selection={{
          id: "i-text", name: "Text Inputs", category: "Inputs & Forms",
          variants: ["text", "email", "with-icon"],
          jsx: `<Input placeholder="sarah@acme.com" />`,
        }}
      >
        <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1.5">
            <Label htmlFor="email-1">Work email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="email-1" defaultValue="sarah.chen@acme.com" className="pl-9" />
            </div>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Floating label"
        selection={{
          id: "i-float", name: "Floating Label Input", category: "Inputs & Forms",
          variants: ["float-on-focus", "float-on-value"],
          jsx: `<div className="relative">\n  <input className="peer pt-5 pb-1 placeholder-transparent" placeholder="Name" />\n  <label className="absolute left-3 top-3 text-xs transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs">\n    Full name\n  </label>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          {[
            { id: "fl-name", label: "Full name", defaultVal: "Sarah Chen", type: "text" },
            { id: "fl-email", label: "Email address", defaultVal: "", type: "email" },
          ].map((f) => (
            <div key={f.id} className="relative">
              <input
                id={f.id}
                type={f.type}
                defaultValue={f.defaultVal}
                placeholder={f.label}
                className="peer block w-full rounded-md border border-border bg-background pb-1.5 pl-3 pt-5 text-sm text-foreground placeholder-transparent ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
              <label
                htmlFor={f.id}
                className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-medium text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted-foreground peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-primary"
              >
                {f.label}
              </label>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Password + strength"
        selection={{
          id: "i-pw", name: "Password Field with Strength", category: "Inputs & Forms",
          variants: ["show/hide", "strength-meter"],
          jsx: `<Input type={show ? "text" : "password"} />\n{/* meter computed from rules */}`,
        }}
      >
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <Label htmlFor="pw">Password</Label>
          <div className="relative">
            <Input id="pw" type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} className="pr-10" />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((s) => !s)}
              className="press absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn("h-1 flex-1 rounded-full bg-muted transition-colors", i < score && STRENGTH_COLORS[score])} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">{STRENGTH_LABELS[score]}</p>
        </div>
      </DemoCard>

      <DemoCard
        label="Textarea"
        selection={{
          id: "i-textarea", name: "Auto-resize Textarea", category: "Inputs & Forms",
          variants: ["auto-resize"],
          jsx: `<Textarea ref={ref} onInput={autoResize} />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
          <Label htmlFor="msg">Message</Label>
          <Textarea
            id="msg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${t.scrollHeight}px`;
            }}
            className="resize-none"
          />
        </div>
      </DemoCard>

      <DemoCard
        label="Select"
        selection={{
          id: "i-select", name: "Select", category: "Inputs & Forms",
          variants: ["single"],
          jsx: `<Select>\n  <SelectTrigger><SelectValue /></SelectTrigger>\n  <SelectContent>...</SelectContent>\n</Select>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
          <Label>Plan</Label>
          <Select defaultValue="pro">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro — $12/mo</SelectItem>
              <SelectItem value="team">Team — $29/mo</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </DemoCard>

      <DemoCard
        label="Combobox / Autocomplete"
        selection={{
          id: "i-combobox", name: "Combobox (searchable select)", category: "Inputs & Forms",
          variants: ["filterable"],
          jsx: `<Popover>\n  <PopoverTrigger><Button>{label}</Button></PopoverTrigger>\n  <PopoverContent>\n    <Command>\n      <CommandInput />\n      <CommandList><CommandItem /></CommandList>\n    </Command>\n  </PopoverContent>\n</Popover>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
          <Label htmlFor="combo">Framework</Label>
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                id="combo"
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                className="w-full justify-between"
              >
                {FRAMEWORKS.find((f) => f.value === framework)?.label ?? "Select…"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search framework…" />
                <CommandList>
                  <CommandEmpty>No framework found.</CommandEmpty>
                  <CommandGroup>
                    {FRAMEWORKS.map((f) => (
                      <CommandItem
                        key={f.value}
                        value={f.label}
                        onSelect={() => { setFramework(f.value); setComboOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", framework === f.value ? "opacity-100" : "opacity-0")} />
                        {f.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </DemoCard>

      <DemoCard
        label="Multi-select chips"
        selection={{
          id: "i-multi", name: "Multi-Select with Chips", category: "Inputs & Forms",
          variants: ["tags"],
          jsx: `<MultiSelect\n  options={TAGS}\n  selected={tags}\n  onSelect={setTags}\n/>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <Label>Tags</Label>
          <Popover open={tagOpen} onOpenChange={setTagOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={tagOpen} className="w-full justify-between font-normal">
                <span className="text-muted-foreground">{tags.length ? `${tags.length} selected` : "Pick tags…"}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search tags…" />
                <CommandList>
                  <CommandEmpty>No tag found.</CommandEmpty>
                  <CommandGroup>
                    {TAGS.map((t) => (
                      <CommandItem key={t} value={t} onSelect={() => toggleTag(t)}>
                        <Check className={cn("mr-2 h-4 w-4", tags.includes(t) ? "opacity-100" : "opacity-0")} />
                        {t}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex flex-wrap gap-1.5 pt-1" aria-live="polite">
            {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags selected</span>}
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => toggleTag(t)}
                  className="ml-0.5 rounded p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="OTP / PIN"
        selection={{
          id: "i-otp", name: "One-Time Password", category: "Inputs & Forms",
          variants: ["6-digit"],
          jsx: `<InputOTP maxLength={6}>\n  <InputOTPGroup>\n    <InputOTPSlot index={0} />…\n  </InputOTPGroup>\n</InputOTP>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <Label>Verification code</Label>
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {otp.length === 6 ? "Code complete" : `${otp.length}/6 digits entered`}
          </p>
        </div>
      </DemoCard>

      <DemoCard
        label="Toggles"
        selection={{
          id: "i-toggles", name: "Checkbox / Radio / Switch", category: "Inputs & Forms",
          variants: ["checkbox", "radio", "switch"],
          jsx: `<Checkbox /> <RadioGroup>...</RadioGroup> <Switch />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="terms" defaultChecked />
            <Label htmlFor="terms" className="text-sm font-normal">I agree to the terms</Label>
          </div>
          <RadioGroup defaultValue="monthly" className="flex gap-4">
            <div className="flex items-center gap-2"><RadioGroupItem value="monthly" id="m" /><Label htmlFor="m" className="font-normal">Monthly</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="yearly" id="y" /><Label htmlFor="y" className="font-normal">Yearly</Label></div>
          </RadioGroup>
          <div className="flex items-center justify-between">
            <Label htmlFor="notif" className="font-normal">Email notifications</Label>
            <Switch id="notif" defaultChecked />
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Slider"
        selection={{
          id: "i-slider", name: "Slider", category: "Inputs & Forms",
          variants: ["single"],
          jsx: `<Slider defaultValue={[42]} max={100} step={1} />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <Label>Storage</Label>
            <span className="font-mono text-muted-foreground">42 GB</span>
          </div>
          <Slider defaultValue={[42]} max={100} step={1} />
        </div>
      </DemoCard>

      <DemoCard
        label="Range slider"
        selection={{
          id: "i-range", name: "Dual-handle Range Slider", category: "Inputs & Forms",
          variants: ["price-range", "dual-handle"],
          jsx: `<Slider\n  defaultValue={[20, 75]}\n  min={0} max={100} step={5}\n  onValueChange={setRange}\n/>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Price range</Label>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              ${range[0]} – ${range[1]}
            </span>
          </div>
          <Slider
            value={range}
            min={0}
            max={100}
            step={5}
            onValueChange={setRange}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>$0</span>
            <span>$100</span>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Date picker"
        selection={{
          id: "i-date", name: "Date Picker (Calendar)", category: "Inputs & Forms",
          variants: ["single-date", "inline"],
          jsx: `<Calendar\n  mode="single"\n  selected={date}\n  onSelect={setDate}\n  initialFocus\n/>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Select date</Label>
            {pickedDate && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {pickedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
          <div className="flex justify-center rounded-lg border border-border">
            <Calendar
              mode="single"
              selected={pickedDate}
              onSelect={setPickedDate}
              className="rounded-lg"
            />
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Color picker"
        selection={{
          id: "i-color", name: "Color Picker", category: "Inputs & Forms",
          variants: ["hue-slider", "swatches", "hex-input"],
          jsx: `<Slider value={[hue]} max={360} onValueChange={([h]) => setHue(h)} />\n<div className="grid grid-cols-11 gap-1">\n  {HUES.map(h => <button style={{ background: hsl(h, 80%, 55%) }} />)}\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 shrink-0 rounded-md border border-border shadow-sm"
              style={{ background: `hsl(${hue}, ${sat}%, ${lit}%)` }}
            />
            <div className="flex-1 space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Hue</div>
              <div
                className="relative h-3 w-full rounded-full"
                style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
              >
                <Slider
                  value={[hue]}
                  min={0}
                  max={360}
                  step={1}
                  onValueChange={([h]) => setHue(h)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-11 gap-1">
            {SWATCH_HUES.map((h) => (
              <button
                key={h}
                type="button"
                aria-label={`Color hue ${h}`}
                onClick={() => setHue(h)}
                className={cn(
                  "aspect-square w-full rounded-md border-2 transition-transform hover:scale-110",
                  hue === h ? "border-foreground" : "border-transparent"
                )}
                style={{ background: `hsl(${h}, 80%, 55%)` }}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Saturation {sat}%</Label>
              <Slider value={[sat]} min={0} max={100} step={1} onValueChange={([s]) => setSat(s)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Lightness {lit}%</Label>
              <Slider value={[lit]} min={10} max={90} step={1} onValueChange={([l]) => setLit(l)} />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5">
            <div className="h-4 w-4 rounded" style={{ background: `hsl(${hue}, ${sat}%, ${lit}%)` }} />
            <span className="flex-1 font-mono text-xs">{hexColor}</span>
            <span className="text-[10px] text-muted-foreground">hsl({hue}, {sat}%, {lit}%)</span>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="File dropzone"
        selection={{
          id: "i-dropzone", name: "File Dropzone", category: "Inputs & Forms",
          variants: ["multiple", "drag-and-drop"],
          jsx: `<div onDragOver={…} onDrop={…}>\n  <input type="file" multiple ref={ref} />\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <Label>Attachments</Label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files); }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-5 text-center text-xs text-muted-foreground transition-colors",
              drag && "border-primary bg-primary/5 text-primary"
            )}
            aria-label="File dropzone. Click or drag files to upload."
          >
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
            <span>{drag ? "Drop files to upload" : "Drag & drop, or click to browse"}</span>
            <span className="text-[10px] opacity-70">PNG, JPG, PDF up to 10MB</span>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
          </div>
          {files.length > 0 && (
            <ul className="space-y-1 text-xs" aria-label="Selected files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded border border-border bg-card px-2 py-1">
                  <span className="flex items-center gap-1.5 truncate">
                    <FileUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DemoCard>

      <DemoCard
        label="Validation states"
        selection={{
          id: "i-validation", name: "Validation States", category: "Inputs & Forms",
          variants: ["error", "success"],
          jsx: `<Input aria-invalid="true" />\n<p className="text-destructive text-xs">Email is invalid</p>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bad">Email</Label>
            <Input id="bad" defaultValue="not-an-email" aria-invalid="true" aria-describedby="bad-err" className="border-destructive focus-visible:ring-destructive" />
            <p id="bad-err" className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />Please enter a valid email address.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="good">Username</Label>
            <Input id="good" defaultValue="sarah_chen" aria-describedby="good-ok" className="border-[hsl(var(--success))] focus-visible:ring-[hsl(var(--success))]" />
            <p id="good-ok" className="flex items-center gap-1 text-xs" style={{ color: "hsl(var(--success))" }}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Available!
            </p>
          </div>
        </div>
      </DemoCard>

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
              {isSubmitting ? "Creating…" : isSubmitSuccessful ? "Done!" : "Create account"}
            </Button>
          </div>
        </form>
      </DemoCard>
    </Section>
  );
}

