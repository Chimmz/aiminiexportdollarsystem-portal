import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <section className="space-y-3">
        <p className="text-sm font-medium text-accent-gold">Style preview</p>
        <h1 className="text-4xl font-semibold tracking-tight">Your AI Export Mentor</h1>
        <h2 className="text-xl font-medium text-muted-foreground">
          A second-level heading, for section titles
        </h2>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">A third-level heading</h3>
        <p className="max-w-prose text-base leading-7">
          This is body text set in Jost, the typeface picked for anything you read at
          length. It should feel light, clean, and easy to scan even when a paragraph runs
          a few lines long, the way this one does.
        </p>

        <p className="max-w-prose text-base leading-7">
          This is body text set in Jost, the typeface picked for anything you read at
          length. It should feel light, clean, and easy to scan even when a paragraph runs
          a few lines long, the way this one does.
        </p>
        <p className="max-w-prose text-base leading-7">
          This is body text set in Jost, the typeface picked for anything you read at
          length. It should feel light, clean, and easy to scan even when a paragraph runs
          a few lines long, the way this one does.
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          This is muted text, used for secondary detail, timestamps, or supporting
          captions sitting underneath something more important.
        </p>
      </section>

      {/* Paragraph font comparison (Jost vs League Spartan) — Jost won.
      <section className="space-y-6">
        <h3 className="text-base font-semibold">Paragraph font comparison</h3>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Jost — current default body font
          </p>
          <p className="max-w-prose text-base leading-7">
            A buyer opening this portal for the first time should be able to tell,
            within a glance, what to do next. Clear hierarchy matters more here than
            personality, since this screen gets scanned dozens of times, not read once
            like a sales page.
          </p>
          <p className="max-w-prose text-base leading-7">
            Numbers, naira amounts, and short status lines will sit next to this kind
            of paragraph often, so the typeface needs to stay legible at smaller sizes
            too, not just as a display face at the top of the page.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            League Spartan — candidate, applied via the font-alt class
          </p>
          <p className="max-w-prose text-base leading-7 font-alt">
            A buyer opening this portal for the first time should be able to tell,
            within a glance, what to do next. Clear hierarchy matters more here than
            personality, since this screen gets scanned dozens of times, not read once
            like a sales page.
          </p>
          <p className="max-w-prose text-base leading-7 font-alt">
            Numbers, naira amounts, and short status lines will sit next to this kind
            of paragraph often, so the typeface needs to stay legible at smaller sizes
            too, not just as a display face at the top of the page.
          </p>
        </div>
      </section>
      */}

      <section className="flex flex-wrap items-center gap-3">
        <Button>Primary button</Button>
        <Button variant="outline">Secondary button</Button>
        <a
          href="#"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          A text link
        </a>
        <span className="rounded-full bg-accent-gold/10 px-3 py-1 text-xs font-medium text-accent-gold">
          Gold badge
        </span>
      </section>

      <section className="rounded-lg border border-border bg-background p-6 shadow-soft">
        <h3 className="text-base font-semibold">An elevated card</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Cards like this lift gently off the page with a soft shadow, used only where
          content is genuinely grouped together.
        </p>
      </section>
    </main>
  );
}
