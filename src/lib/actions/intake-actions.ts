import { createServiceClient } from '@/lib/supabase/service';
import { upsertProfileFact } from '@/lib/actions/memory-actions';
import { INTAKE_QUESTIONS, isQuestionVisible, type IntakeAnswers } from '@/lib/utils/intake-utils';

// Called once, from src/app/onboarding's final-step server action, after
// the client has walked the whole (possibly branching) question set.
// Writes each VISIBLE answer as a profile_fact (source 'intake' -- see
// migrations/0031 and memory-utils.ts's hasNoMemory for why that source
// value matters), skipping any question the user's own earlier answers
// made inapplicable, then flips users.intake_completed_at so
// dashboard/layout.tsx stops redirecting here. Same "write via service
// role, not the cookie-bound client" reasoning as
// activateUserOnFirstMessage (access-actions.ts) -- intake_completed_at
// isn't in the column-level grant users have for self-editing their own
// row (migrations/0027), on purpose, since it's a server-validated gate,
// not a profile field someone should be able to flip themselves.
export async function submitIntakeSurvey(
  userId: string,
  answers: IntakeAnswers
): Promise<void> {
  const visible = INTAKE_QUESTIONS.filter((q) => isQuestionVisible(q, answers));

  for (const question of visible) {
    const value = answers[question.id]?.trim();
    if (!value) continue;
    await upsertProfileFact(userId, question.id, value, null, 'intake');
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('users')
    .update({ intake_completed_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(`complete intake survey: ${error.message}`);
}
