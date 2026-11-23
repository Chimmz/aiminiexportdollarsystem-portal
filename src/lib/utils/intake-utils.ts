// The first-login intake survey's question definitions (src/app/
// onboarding) -- pure shapes and the small branching logic over them,
// no I/O. The actual save path (profile_facts writes + users.
// intake_completed_at) lives in lib/actions/intake-actions.ts.
//
// Deliberately short (2 always-shown questions, 1 conditional follow-up --
// 3 steps at most) and scoped to things that genuinely change how Eva
// should talk to this person from message one -- not a general survey.
// Answers land in
// profile_facts (source 'intake') under these exact ids as fact_type, so
// Eva already sees them via formatMemoryForPrompt (memory-utils.ts) with
// zero extra wiring; picking a stable, descriptive id here IS picking the
// fact_type the model reads for the rest of this person's account.

import { NIGERIA_STATE_CAPITALS } from './country-utils';

export type IntakeAnswers = Record<string, string>;

interface BaseQuestion {
  id: string;
  prompt: string;
  // Only asked when the referenced earlier answer equals this value --
  // e.g. the course-blocker question only makes sense for someone who
  // said they'd bought a course before. Omitted for an always-shown
  // question.
  showIf?: { questionId: string; equals: string };
}

export interface BooleanQuestion extends BaseQuestion {
  type: 'boolean';
}

export interface ChoiceQuestion extends BaseQuestion {
  type: 'choice';
  options: { value: string; label: string }[];
  // Renders a free-text "Something else" option alongside the fixed
  // ones -- stored as the raw text typed, not prefixed, since fact_value
  // is just read as prose by Eva and a human skimming profile_facts, not
  // branched on anywhere.
  allowOther?: boolean;
}

export interface TextQuestion extends BaseQuestion {
  type: 'text';
  placeholder?: string;
}

// Same idea as ChoiceQuestion (a fixed set of values, no free text) but
// rendered as a dropdown instead of a column of buttons -- for an option
// list too long to show one button per row, like all 36 states + FCT.
export interface SelectQuestion extends BaseQuestion {
  type: 'select';
  options: { value: string; label: string }[];
  placeholder?: string;
}

export type IntakeQuestion = BooleanQuestion | ChoiceQuestion | TextQuestion | SelectQuestion;

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'bought_export_course_before',
    type: 'boolean',
    prompt: 'Before now, had you ever bought a course on how to export?',
  },
  {
    id: 'export_blocker',
    type: 'choice',
    prompt: "What's mainly kept you from actually exporting so far?",
    showIf: { questionId: 'bought_export_course_before', equals: 'yes' },
    options: [
      { value: 'no_buyers', label: "Couldn't find real buyers" },
      { value: 'sourcing_packaging', label: "Didn't know how to source or package it" },
      { value: 'capital', label: "Didn't have enough capital" },
      { value: 'documentation', label: 'Documentation/customs felt too confusing' },
      { value: 'trust', label: "Wasn't sure who to trust in the process" },
    ],
    allowOther: true,
  },
  {
    id: 'location',
    type: 'select',
    prompt: 'Which state will you be exporting from?',
    placeholder: 'Select a state',
    options: Object.keys(NIGERIA_STATE_CAPITALS).map((state) => ({
      value: state,
      label: state,
    })),
  },
];

export function isQuestionVisible(question: IntakeQuestion, answers: IntakeAnswers): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.equals;
}

// The ordered list of questions this specific set of answers actually
// walks through -- skips a conditional question whose trigger wasn't
// answered the triggering way, so e.g. someone who never bought a course
// never sees the course-blocker question at all, and the wizard's own
// step count/progress bar reflects their real path, not the full list.
export function visibleQuestions(answers: IntakeAnswers): IntakeQuestion[] {
  return INTAKE_QUESTIONS.filter((q) => isQuestionVisible(q, answers));
}
