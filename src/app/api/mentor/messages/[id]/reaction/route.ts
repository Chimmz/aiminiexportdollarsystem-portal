import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Reaction = 'like' | 'dislike' | null;

interface ReactionBody {
  reaction: Reaction;
  note?: string | null;
}

// Client-triggered (MessageFeedback's heart/thumbs-down icons) -- unlike
// the rest of mentor-messages-actions.ts, which only ever runs from
// /api/mentor/chat through the service-role client, this goes through
// the regular, RLS-respecting client instead: "messages full access on
// own row" (migrations/0011_mentor_messages.sql) already restricts the
// update to auth.uid() = user_id, so there's no separate ownership check
// to write by hand -- a request for someone else's message id just
// updates zero rows, not an error.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: ReactionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.reaction !== 'like' && body.reaction !== 'dislike' && body.reaction !== null) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
  }

  // Notes only ever make sense alongside a dislike -- liking something
  // needs no explanation, and clearing a reaction has nothing to attach
  // one to either. Enforced here so a stale note can never survive a
  // later reaction change, regardless of what the client sends.
  const note = body.reaction === 'dislike' ? body.note?.trim() || null : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from('messages')
    .update({ reaction: body.reaction, reaction_note: note })
    .eq('id', id)
    .eq('role', 'assistant');

  if (error) {
    console.error('[mentor] set message reaction failed:', error.message);
    return NextResponse.json({ error: 'Could not save reaction' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
