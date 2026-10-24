import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/actions/user-actions';
import {
  getProfileFacts,
  upsertProfileFact,
  deleteProfileFact,
  clearProfileFacts,
} from '@/lib/actions/memory-actions';

// Backs the chat-controls rail's Memory section (view/add/delete/clear) --
// a plain CRUD surface over profile_facts, called directly from the rail,
// not through the model. Same getCurrentUser() + real-401 pattern as
// price-quotes/route.ts: there's no sensible signed-out behavior for any
// of these.

const AddFactSchema = z.object({
  factType: z.string().trim().min(1).max(60),
  factValue: z.string().trim().min(1).max(500),
});
const DeleteFactSchema = z.object({ factType: z.string().trim().min(1) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const facts = await getProfileFacts(user.id);
    return NextResponse.json({ facts });
  } catch (err) {
    console.error('[mentor] list profile facts failed:', err);
    return NextResponse.json({ error: 'Failed to load memory' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AddFactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    await upsertProfileFact(
      user.id,
      parsed.data.factType,
      parsed.data.factValue,
      null,
      'user_provided'
    );
  } catch (err) {
    console.error('[mentor] add profile fact failed:', err);
    return NextResponse.json({ error: 'Failed to save fact' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  // No body at all -> clear everything; a { factType } body -> just that
  // one. One route, two destructiveness levels, rather than a second route
  // for what's otherwise the same delete operation.
  const body = await req.json().catch(() => null);

  try {
    if (body === null) {
      await clearProfileFacts(user.id);
    } else {
      const parsed = DeleteFactSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.message }, { status: 400 });
      }
      await deleteProfileFact(user.id, parsed.data.factType);
    }
  } catch (err) {
    console.error('[mentor] delete profile fact(s) failed:', err);
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
