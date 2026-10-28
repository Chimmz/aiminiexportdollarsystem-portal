-- working-memory.ts moved from "one hybrid search per recent message" to
-- one combined search per turn: a single query embedding and a single
-- OR-joined keyword set, both built from every recent message at once
-- (see that file's buildKeywordQuery), instead of N separate Promise.all
-- round trips. That changes what the keyword half needs from Postgres:
-- websearch_to_tsquery ANDs bare words together by default, which was
-- fine for one message's own text, but AND-ing the distinct words from
-- several different recent messages into one query would require a
-- single older message to contain nearly every one of those words at
-- once -- in practice that almost never matches anything. to_tsquery
-- takes an already-OR-joined expression ('word1 | word2 | word3')
-- directly, still normalized through the same english dictionary
-- (stemming, stopword-dropping) websearch_to_tsquery used.
--
-- Same signature, same table/index from 0018 -- only the query-building
-- inside the function body changes.
create or replace function public.match_mentor_messages_text (
  p_user_id uuid,
  query_text text,
  exclude_ids text[] default '{}',
  pool_limit int default 20,
  match_count int default 5
)
returns table (
  id text,
  role text,
  parts jsonb,
  created_at timestamptz,
  rank float
)
language sql stable
as $$
  with pool as (
    select id, role, parts, created_at, content_tsv
    from public.messages
    where user_id = p_user_id
      and content is not null
      and not (id = any (exclude_ids))
    order by created_at desc
    limit pool_limit
  )
  select id, role, parts, created_at,
         ts_rank(content_tsv, to_tsquery('english', query_text)) as rank
  from pool
  where content_tsv @@ to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;
