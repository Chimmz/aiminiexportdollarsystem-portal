-- Lets a member mark whether an assistant reply actually helped
-- (MessageFeedback, components/ai-elements/message-feedback.tsx) --
-- purely a signal for later human review (improving the system prompt/
-- KB content over time), never fed back into live prompting. Columns on
-- `messages` itself, not a separate table -- a single reaction/note per
-- message, not a one-to-many relationship.
--
-- reaction_note is only ever populated alongside 'dislike' -- liking
-- something needs no explanation. The app layer (the PATCH route this
-- powers) always nulls it out whenever reaction isn't 'dislike', so it
-- can't go stale if a reaction later flips to 'like' or gets cleared.
alter table public.messages
  add column if not exists reaction text check (reaction in ('like', 'dislike'));
alter table public.messages
  add column if not exists reaction_note text;
