'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { submitIntakeSurvey } from '@/lib/actions/intake-actions';
import type { IntakeAnswers } from '@/lib/utils/intake-utils';

// The wizard (intake-wizard.tsx) calls this once, after the last question
// in the user's own (possibly branching) path is answered -- never the
// user id from the client, always re-derived from the session here, same
// as every other mutation in this codebase. Redirects server-side on
// success so the client never needs its own router.push: the wizard's
// pending state just covers however long this call takes.
export async function completeIntake(answers: IntakeAnswers): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  await submitIntakeSurvey(user.id, answers);
  redirect('/dashboard');
}
