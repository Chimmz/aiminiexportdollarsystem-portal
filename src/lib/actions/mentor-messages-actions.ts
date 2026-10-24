import { createServiceClient } from '@/lib/supabase/service';
import type { AppMessage } from '@/app/api/mentor/chat/route';

// Reads/writes the `messages` table (see
// supabase/migrations/0011_mentor_messages.sql). Service-role client,
// same reasoning as memory-actions.ts -- these only ever run from
// /api/mentor/chat (a server route), never a client bundle.

export async function getMentorMessages(userId: string): Promise<AppMessage[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, parts')
    .eq('user_id', userId)
    .order('seq', { ascending: true });
  if (error) throw new Error(`mentor messages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as AppMessage['role'],
    parts: row.parts as AppMessage['parts'],
  }));
}

// Called from route.ts's onFinish with just the turn's new messages (the
// user message that wasn't yet persisted, plus whatever Eva responded
// with) -- not the full conversation every time. Upsert by id rather than
// a plain insert so a continued/resumed stream (isContinuation in
// onFinish's event) overwrites its own row instead of erroring on a
// duplicate key.
export async function saveMentorMessages(
  userId: string,
  messages: AppMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const supabase = createServiceClient();
  const { error } = await supabase.from('messages').upsert(
    messages.map((message) => ({
      id: message.id,
      user_id: userId,
      role: message.role,
      parts: message.parts,
    })),
    { onConflict: 'id' }
  );
  if (error) throw new Error(`save mentor messages: ${error.message}`);
}

// The chat-controls rail's "Clear chats" action, once persistence exists
// -- without this, reloading the page would bring old messages straight
// back since page.tsx re-seeds useChat from this same table.
export async function clearMentorMessages(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('messages').delete().eq('user_id', userId);
  if (error) throw new Error(`clear mentor messages: ${error.message}`);
}
