'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { visibleQuestions, type IntakeAnswers, type IntakeQuestion } from '@/lib/utils/intake-utils';
import { completeIntake } from '../actions';

const OTHER_VALUE = '__other__';

// Re-derives what a text/choice question's input controls should show
// when the wizard lands on it -- either fresh (nothing answered yet) or
// because the back button brought the user back to a step they'd already
// answered. Boolean questions need no priming -- their Yes/No buttons
// read the previous choice straight off `answers` on every render.
function primeDraftsForQuestion(question: IntakeQuestion, answers: IntakeAnswers) {
  const existing = answers[question.id];
  if (question.type === 'text') {
    return { draft: existing ?? '', otherDraft: '' };
  }
  if (question.type === 'choice' && existing) {
    const isKnownOption = question.options.some((o) => o.value === existing);
    if (!isKnownOption) return { draft: OTHER_VALUE, otherDraft: existing };
  }
  return { draft: '', otherDraft: '' };
}

// A carousel: one question per screen, with a timeline up top and a back
// button alongside it. Going back never touches `answers`, so the
// steps list (visibleQuestions re-derived off the current answers) stays
// identical to what it was going forward -- the only thing that can
// shrink/grow it is re-answering a question differently, which only
// happens through advance() below, and that already recomputes the step
// count off the fresh answer before deciding where "next" actually is.
export function IntakeWizard({ firstName }: { firstName: string | null }) {
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [otherDraft, setOtherDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const steps = useMemo(() => visibleQuestions(answers), [answers]);
  const question = steps[stepIndex] as IntakeQuestion | undefined;

  const goBack = () => {
    if (stepIndex === 0 || submitting) return;
    const prevIndex = stepIndex - 1;
    const primed = primeDraftsForQuestion(steps[prevIndex], answers);
    setDraft(primed.draft);
    setOtherDraft(primed.otherDraft);
    setStepIndex(prevIndex);
  };

  const advance = async (value: string) => {
    const next = { ...answers, [question!.id]: value };
    setAnswers(next);

    const nextSteps = visibleQuestions(next);
    const isLastOfKnownSteps = stepIndex + 1 >= nextSteps.length;
    if (isLastOfKnownSteps) {
      setSubmitting(true);
      try {
        await completeIntake(next);
        // completeIntake redirects server-side on success -- this point
        // only reruns if that call threw instead (redirect()'s own throw
        // is handled by Next before it ever reaches here as a rejection).
      } catch {
        setSubmitting(false);
        toast('Could not save your answers', {
          description: "Something went wrong on our end. Please try again, and if it keeps happening, reach out to us.",
        });
      }
      return;
    }
    const primed = primeDraftsForQuestion(nextSteps[stepIndex + 1], next);
    setDraft(primed.draft);
    setOtherDraft(primed.otherDraft);
    setStepIndex(stepIndex + 1);
  };

  if (!question) return null;

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 -z-10 bg-radial from-primary/15 via-accent-gold/5 to-transparent"
      />

      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={stepIndex === 0 || submitting}
            onClick={goBack}
            aria-label="Previous question"
            className="shrink-0 disabled:opacity-0"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <StepTimeline total={steps.length} current={stepIndex} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-soft"
          >
            <h1 className="text-lg font-semibold leading-snug">
              {stepIndex === 0 && firstName ? `${firstName}, ` : ''}
              {question.prompt}
            </h1>

            {question.type === 'boolean' && (
              <div className="flex gap-3">
                <Button
                  size="lg"
                  variant={answers[question.id] === 'yes' ? 'default' : 'outline'}
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => advance('yes')}
                >
                  Yes
                </Button>
                <Button
                  size="lg"
                  variant={answers[question.id] === 'no' ? 'default' : 'outline'}
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => advance('no')}
                >
                  No
                </Button>
              </div>
            )}

            {question.type === 'choice' && (
              <div className="flex flex-col gap-2">
                {question.options.map((option) => (
                  <Button
                    key={option.value}
                    variant={answers[question.id] === option.value ? 'default' : 'outline'}
                    disabled={submitting}
                    className="justify-start text-left whitespace-normal h-auto py-2.5"
                    onClick={() => advance(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}

                {question.allowOther &&
                  (draft === OTHER_VALUE ? (
                    <div className="flex gap-2 pt-1">
                      <Input
                        autoFocus
                        placeholder="Tell us briefly"
                        value={otherDraft}
                        disabled={submitting}
                        onChange={(e) => setOtherDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && otherDraft.trim()) advance(otherDraft.trim());
                        }}
                      />
                      <Button
                        disabled={submitting || !otherDraft.trim()}
                        onClick={() => advance(otherDraft.trim())}
                      >
                        {submitting ? <Loader2Icon className="size-4 animate-spin" /> : 'Go'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={submitting}
                      className="justify-start text-left text-muted-foreground"
                      onClick={() => setDraft(OTHER_VALUE)}
                    >
                      Something else
                    </Button>
                  ))}
              </div>
            )}

            {question.type === 'select' && (
              <Select
                disabled={submitting}
                value={answers[question.id] ?? undefined}
                onValueChange={(value) => advance(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={question.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {question.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {submitting && question.type !== 'text' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Saving your answers…
              </div>
            )}

            {question.type === 'text' && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder={question.placeholder}
                  value={draft}
                  disabled={submitting}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.trim()) advance(draft.trim());
                  }}
                />
                <Button
                  disabled={submitting || !draft.trim()}
                  onClick={() => advance(draft.trim())}
                  aria-label="Continue"
                  size="icon"
                  className={cn(submitting && 'opacity-70')}
                >
                  {submitting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <ArrowRightIcon className="size-4" />
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// The carousel's progress indicator -- a dot per step joined by a line,
// filled up through the current one. `total` is steps.length, which can
// be 2 or 3 depending on how the first question was answered, so this
// re-renders its own dot count rather than assuming a fixed length.
function StepTimeline({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex flex-1 items-center" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex flex-1 items-center last:flex-initial">
          <div
            className={cn(
              'size-2 shrink-0 rounded-full transition-colors',
              i <= current ? 'bg-primary' : 'bg-border'
            )}
          />
          {i < total - 1 && (
            <div
              className={cn(
                'h-px flex-1 transition-colors',
                i < current ? 'bg-primary' : 'bg-border'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
