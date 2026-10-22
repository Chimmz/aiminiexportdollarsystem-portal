'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { Button } from '@/components/ui/button';
import { NairaAmount, NairaSign } from '@/components/ui/naira-sign';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  TriangleAlert,
} from 'lucide-react';

// Rendered for the calculatePricingTool's output (see
// mentor-chat-client.tsx's 'tool-calculatePricing' case) -- the one tool
// panel in this app that's an actual working calculator rather than a
// read-only recap of something the model already decided. Every number
// here is computed live in the browser from what the user types; Eva never
// sees any of it until Save turns it into a plain follow-up chat message
// (see onSave below), the same way a suggestion chip turns a click into a
// message (see mentor-chat-client.tsx's handleSuggestionClick).
//
// Steps are strictly linear (see STEPS below) -- Next only advances one
// step, and the step dots above the carousel can jump back to any
// already-unlocked step but never ahead of it. opts.watchDrag is off on
// the underlying Carousel so a swipe can't skip a step the same way a dot
// click can't.
//
// Each step is written as an inline formula (label = input op input =
// result) rather than a stack of labeled fields, per the source material's
// own notation and to not look like a login form. Embla keeps every
// CarouselItem mounted at once (just shifted off-screen), so only the very
// first field in the whole panel may have autoFocus -- a second autoFocus
// on a later step previously stole focus into an off-screen input on
// mount. Don't add autoFocus to any field below except totalCost's.

function parsePositiveNumber(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegativeNumber(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

function formatNumber(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

type MarketSite = 'amazon' | 'ebay' | 'walmart';

const MARKET_SITES: { site: MarketSite; label: string }[] = [
  { site: 'amazon', label: 'Amazon' },
  { site: 'ebay', label: 'eBay' },
  // Walmart, not Alibaba/Tradekey, to match the small-scale trio the
  // training material itself names (Walmart, Amazon, eBay) -- Alibaba is
  // the large-scale/wholesale reference instead, a different kind of
  // price than a single retail unit.
  { site: 'walmart', label: 'Walmart' },
];

function marketSearchUrl(site: MarketSite, product: string | null): string {
  const q = product ? encodeURIComponent(product) : '';
  switch (site) {
    case 'amazon':
      return `https://www.amazon.com/s${q ? `?k=${q}` : ''}`;
    case 'ebay':
      return `https://www.ebay.com/sch/i.html${q ? `?_nkw=${q}` : ''}`;
    case 'walmart':
      return `https://www.walmart.com/search${q ? `?q=${q}` : ''}`;
  }
}

const STEPS = ['Unit Cost', 'Add Margin', 'Convert to $', 'Market Check'] as const;

// Every operand in a formula row gets its own tiny label on top -- real
// text for an actual field or result, an invisible placeholder of the same
// size for a bare operator or the equation's leading name -- so every
// label row reserves the same height and the boxes/symbols all line up on
// one baseline underneath, labeled or not.
function LabelSlot({ label }: { label?: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70',
        !label && 'invisible'
      )}
    >
      {label ?? '·'}
    </span>
  );
}

// A compact, inline operand for a formula row -- not a full labeled field,
// just a narrow box with its ₦/%/$ adornment tight against it.
function FormulaInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <LabelSlot label={label} />
      <InputGroup className="h-11 w-28 rounded-xl">
        {prefix ? (
          <InputGroupAddon>
            <InputGroupText className="text-sm font-semibold">{prefix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
        <InputGroupInput
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="text-left text-lg font-semibold"
        />
        {suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-sm font-semibold">{suffix}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  );
}

// A read-only operand carried over from an earlier step (e.g. unit cost
// reused inside the margin formula).
function ValueChip({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <LabelSlot label={label} />
      <span className="inline-flex h-11 items-center rounded-xl bg-secondary/60 px-3 text-lg font-semibold text-foreground/80">
        {children}
      </span>
    </div>
  );
}

// The computed answer at the end of a formula row -- plain text, not a
// chip, so it reads as the live result of the equation rather than
// another static value like ValueChip's carried-over operands.
function ResultChip({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <LabelSlot label={label} />
      <span className="inline-flex h-11 items-center text-lg font-bold text-foreground">
        {children}
      </span>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <LabelSlot />
      <span className="flex h-11 items-center text-lg font-medium text-muted-foreground/60">
        {children}
      </span>
    </div>
  );
}

function FormulaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <LabelSlot />
      <span className="flex h-11 items-center text-sm font-semibold text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

// Small, subtle per-field notes below a formula row -- not a sentence
// under every box, just one quiet line per term.
function Hints({ items }: { items: { term: string; text: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map(({ term, text }) => (
        <p key={term} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{term}</span> — {text}
        </p>
      ))}
    </div>
  );
}

export function PricingCalculatorPanel({
  product,
  bankRate,
  asOf,
  isFallback,
  onSave,
  onToggle,
}: {
  product: string | null;
  bankRate: number;
  asOf: string;
  isFallback: boolean;
  // A plain, first-person chat message describing the finished
  // calculation -- the parent sends it as a real user message so Eva
  // responds to and records it normally, same shape as a suggestion chip
  // click (see mentor-chat-client.tsx's handleSuggestionClick).
  onSave: (message: string) => void;
  onToggle?: () => void;
}) {
  const [totalCost, setTotalCost] = useState('');
  const [totalQuantity, setTotalQuantity] = useState('');
  const [profitMargin, setProfitMargin] = useState('');
  const [bankRateInput, setBankRateInput] = useState(String(bankRate));
  const [marketPrice, setMarketPrice] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [api, setApi] = useState<CarouselApi>();
  const [step, setStep] = useState(0);
  const [maxUnlocked, setMaxUnlocked] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setStep(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const totalCostNum = parsePositiveNumber(totalCost);
  const totalQuantityNum = parsePositiveNumber(totalQuantity);
  const unitCost =
    totalCostNum !== null && totalQuantityNum !== null
      ? totalCostNum / totalQuantityNum
      : null;

  const marginNum = parseNonNegativeNumber(profitMargin);
  const sellingPriceNaira =
    unitCost !== null && marginNum !== null
      ? unitCost + unitCost * (marginNum / 100)
      : null;

  const bankRateNum = parsePositiveNumber(bankRateInput);
  const priceUsd =
    sellingPriceNaira !== null && bankRateNum !== null
      ? sellingPriceNaira / bankRateNum
      : null;

  const marketPriceNum = parsePositiveNumber(marketPrice);

  const step1Valid = unitCost !== null;
  const step2Valid = step1Valid && sellingPriceNaira !== null;
  const step3Valid = step2Valid && priceUsd !== null;

  const marketComparison = useMemo(() => {
    if (priceUsd === null || marketPriceNum === null) return null;
    return priceUsd < marketPriceNum ? 'lower' : 'not-lower';
  }, [priceUsd, marketPriceNum]);

  // Each step shows a different number of fields, so stepping through this
  // resizes the scrollable conversation the same way opening/closing any
  // other tool-call panel does -- see mentor-chat-client.tsx's onToggle
  // plumbing for why that needs a brief auto-scroll suppression.
  function goTo(index: number) {
    if (index > maxUnlocked) return;
    api?.scrollTo(index);
    onToggle?.();
  }

  function advance() {
    const next = Math.min(step + 1, STEPS.length - 1);
    setMaxUnlocked((m) => Math.max(m, next));
    api?.scrollTo(next);
    onToggle?.();
  }

  function back() {
    api?.scrollTo(Math.max(step - 1, 0));
    onToggle?.();
  }

  // Posts the exact numbers straight to price_quotes (see
  // pricing-actions.ts) before telling Eva anything -- those need to be
  // the real values, not a model's transcription of them back out of a
  // chat message. onSave's prose summary still goes to Eva afterward so
  // she reacts and notes it on the deal step as usual, but it's no longer
  // the only record of what was actually calculated.
  async function handleSave() {
    if (
      !step3Valid ||
      unitCost === null ||
      sellingPriceNaira === null ||
      priceUsd === null ||
      totalCostNum === null ||
      totalQuantityNum === null ||
      marginNum === null ||
      bankRateNum === null
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/mentor/price-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          totalCost: totalCostNum,
          totalQuantity: totalQuantityNum,
          unitCost,
          profitMarginPct: marginNum,
          bankRate: bankRateNum,
          priceNgn: sellingPriceNaira,
          priceUsd,
          marketPriceUsd: marketPriceNum,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error('[mentor] save price quote failed:', err);
      toast('Could not save your price quote. Try again.');
      setSaving(false);
      return;
    }
    setSaving(false);

    const lines = [
      `I worked out my pricing:`,
      `- Unit cost: ₦${formatNumber(unitCost)} (₦${formatNumber(totalCostNum)} total ÷ ${formatNumber(totalQuantityNum, 0)} units)`,
      `- Profit margin: ${formatNumber(marginNum, 0)}%`,
      `- Selling price: ₦${formatNumber(sellingPriceNaira)} per unit`,
      `- In dollars at ₦${formatNumber(bankRateNum)}/$ (bank rate): $${formatNumber(priceUsd)} per unit`,
    ];
    if (marketPriceNum !== null) {
      lines.push(
        `- Market price I found${product ? ` for ${product}` : ''}: $${formatNumber(marketPriceNum)}`
      );
    }
    lines.push(`Please save this as my price quote for this deal.`);
    onSave(lines.join('\n'));
    setSaved(true);
  }

  return (
    <div className="mx-1 mt-4 not-prose mb-3 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 border-b bg-secondary/40 px-5 py-3.5">
        <Calculator className="size-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold">
          Price {product ? `your ${product}` : 'your product'}
        </span>
      </div>

      <div className="flex items-start px-5 pt-5">
        {STEPS.flatMap((label, i) => {
          const unlocked = i <= maxUnlocked;
          const active = i === step;
          const dot = (
            <button
              key={`dot-${label}`}
              type="button"
              disabled={!unlocked}
              onClick={() => goTo(i)}
              className="group flex shrink-0 flex-col items-center gap-1.5 disabled:cursor-not-allowed"
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : unlocked
                      ? 'bg-secondary text-foreground group-hover:bg-secondary/70'
                      : 'bg-secondary/50 text-muted-foreground/50'
                )}
              >
                {i < maxUnlocked ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap',
                  active ? 'text-foreground' : 'text-muted-foreground/70'
                )}
              >
                {label}
              </span>
            </button>
          );
          if (i === 0) return [dot];
          const connector = (
            <div
              key={`line-${label}`}
              className={cn(
                'mt-3.5 h-0.5 flex-1 rounded-full transition-colors',
                i <= maxUnlocked ? 'bg-primary' : 'bg-border'
              )}
            />
          );
          return [connector, dot];
        })}
      </div>

      <Carousel setApi={setApi} opts={{ watchDrag: false }} className="px-5 pt-5 pb-5">
        <CarouselContent>
          {/* Step 1: Unit Cost */}
          <CarouselItem>
            <div className="flex flex-col gap-5 pt-2">
              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-3">
                <FormulaLabel>Unit Cost</FormulaLabel>
                <Op>=</Op>
                <FormulaInput
                  label="Total cost"
                  value={totalCost}
                  onChange={setTotalCost}
                  prefix={<NairaSign />}
                  placeholder="0"
                  autoFocus
                />
                <Op>÷</Op>
                <FormulaInput
                  label="Quantity"
                  value={totalQuantity}
                  onChange={setTotalQuantity}
                  placeholder="0"
                />
                <Op>=</Op>
                <ResultChip label="Unit cost">
                  {unitCost !== null ? (
                    <NairaAmount>{formatNumber(unitCost)}</NairaAmount>
                  ) : (
                    '—'
                  )}
                </ResultChip>
              </div>
              <Hints
                items={[
                  {
                    term: 'Total cost',
                    text: 'all your costs for this batch — goods, packaging, transport, everything.',
                  },
                  {
                    term: 'Quantity',
                    text: "how many units you're pricing — bottles, packs, kg, tons, whatever you sell in.",
                  },
                ]}
              />
              <Button onClick={advance} disabled={!step1Valid} className="w-full">
                Next
                <ChevronRight />
              </Button>
            </div>
          </CarouselItem>

          {/* Step 2: Add profit margin */}
          <CarouselItem>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-3">
                <FormulaLabel>Selling Price</FormulaLabel>
                <Op>=</Op>
                <ValueChip label="Unit cost">
                  <NairaAmount>{unitCost !== null ? formatNumber(unitCost) : '—'}</NairaAmount>
                </ValueChip>
                <Op>+</Op>
                <Op>(</Op>
                <ValueChip label="Unit cost">
                  <NairaAmount>{unitCost !== null ? formatNumber(unitCost) : '—'}</NairaAmount>
                </ValueChip>
                <Op>×</Op>
                <FormulaInput
                  label="Margin %"
                  value={profitMargin}
                  onChange={setProfitMargin}
                  suffix="%"
                  placeholder="0"
                />
                <Op>)</Op>
                <Op>=</Op>
                <ResultChip label="Selling price">
                  {sellingPriceNaira !== null ? (
                    <NairaAmount>{formatNumber(sellingPriceNaira)}</NairaAmount>
                  ) : (
                    '—'
                  )}
                </ResultChip>
              </div>
              <Hints
                items={[
                  {
                    term: 'Profit margin',
                    text: 'your call — the material suggests anywhere from 10% to 100%+, depending on your product and what the market can bear.',
                  },
                ]}
              />
              <div className="flex gap-2">
                <Button onClick={back} variant="outline" className="flex-1">
                  <ChevronLeft />
                  Back
                </Button>
                <Button onClick={advance} disabled={!step2Valid} className="flex-1">
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </CarouselItem>

          {/* Step 3: Convert to dollars */}
          <CarouselItem>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-3">
                <FormulaLabel>Price in USD</FormulaLabel>
                <Op>=</Op>
                <ValueChip label="Selling price">
                  <NairaAmount>
                    {sellingPriceNaira !== null ? formatNumber(sellingPriceNaira) : '—'}
                  </NairaAmount>
                </ValueChip>
                <Op>÷</Op>
                <FormulaInput
                  label="Bank rate"
                  value={bankRateInput}
                  onChange={setBankRateInput}
                  prefix={<NairaSign />}
                />
                <Op>=</Op>
                <ResultChip label="Price (USD)">
                  {priceUsd !== null ? <>${formatNumber(priceUsd)}</> : '—'}
                </ResultChip>
              </div>
              <Hints
                items={[
                  {
                    term: 'Bank rate',
                    text: isFallback
                      ? `live rate lookup failed as of ${asOf} — this is a rough estimate, confirm your actual bank rate before relying on it.`
                      : `today's bank rate as of ${asOf}, prefilled — edit it if your bank quotes you something different.`,
                  },
                ]}
              />
              <div className="flex gap-2">
                <Button onClick={back} variant="outline" className="flex-1">
                  <ChevronLeft />
                  Back
                </Button>
                <Button onClick={advance} disabled={!step3Valid} className="flex-1">
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </CarouselItem>

          {/* Step 4: Market check + Save */}
          <CarouselItem>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-3">
                <FormulaLabel>Your price</FormulaLabel>
                <Op>=</Op>
                <ResultChip>
                  {priceUsd !== null ? <>${formatNumber(priceUsd)}</> : '—'}
                </ResultChip>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  Optional: check what it&rsquo;s actually selling for, then compare
                  below.
                </span>
                <div className="flex flex-wrap gap-2">
                  {MARKET_SITES.map(({ site, label }) => (
                    <a
                      key={site}
                      href={marketSearchUrl(site, product)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/90 hover:bg-muted"
                    >
                      {label}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-x-2.5 gap-y-3">
                <FormulaLabel>Market price</FormulaLabel>
                <Op>=</Op>
                <FormulaInput
                  value={marketPrice}
                  onChange={setMarketPrice}
                  prefix="$"
                  placeholder="0"
                />
              </div>

              {marketComparison === 'lower' ? (
                <p className="flex items-center gap-1.5 text-sm text-primary">
                  <CheckCircle2 className="size-4 shrink-0" />
                  You&rsquo;re priced lower than what you found — good position.
                </p>
              ) : marketComparison === 'not-lower' ? (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <TriangleAlert className="size-4 shrink-0" />
                  Your price is at or above what you found — worth reconsidering your
                  margin.
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  onClick={back}
                  variant="outline"
                  className="flex-1"
                  disabled={saved || saving}
                >
                  <ChevronLeft />
                  Back
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saved || saving}
                  className="flex-1"
                >
                  {saved ? (
                    <>
                      <Check />
                      Saved
                    </>
                  ) : saving ? (
                    <>
                      <Spinner />
                      Saving
                    </>
                  ) : (
                    'Save to my deal'
                  )}
                </Button>
              </div>
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  );
}
