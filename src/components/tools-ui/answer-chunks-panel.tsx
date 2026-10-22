'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { BookOpenIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { RetrievedChunk } from '@/lib/utils/chunks-utils';

// How much of a chunk's content to show, not how much the model got — the
// tool still hands the model the full excerpt (see answer-question-tool.ts)
// for real grounding. This is only the on-screen preview, deliberately cut
// short: this is the course's paid training material, and showing full
// excerpts here would make the whole knowledge base scrapable straight out
// of the chat UI.
const TRUNCATE_AT = 220;

function truncate(text: string, max: number): string {
  const flattened = text.trim().replace(/\s+/g, ' ');
  if (flattened.length <= max) return flattened;
  return `${flattened.slice(0, max).trimEnd()}…`;
}

// keyword is a comma-and/or-space-separated string the model writes
// (e.g. "bitterkola, export, market") -- split on either, not just
// whitespace, or a trailing comma rides along into the tag ("bitterkola,").
function splitKeywords(keyword: string | null): string[] {
  if (!keyword) return [];
  return [
    ...new Set(
      keyword
        .split(/[,\s]+/)
        .map((k) => k.trim())
        .filter(Boolean)
    ),
  ];
}

// Rendered for the answerQuestion tool's output (see
// mentor-chat-client.tsx's 'tool-answerQuestion' case), the retrieval
// counterpart to tools-ui/contacts-carousel.tsx. Collapsed by default, same
// pattern as ai-elements/reasoning.tsx and sources.tsx -- the detail is
// there to inspect, not something that should visually compete with Eva's
// actual answer underneath it. Plain paragraphs separated by a Separator
// rather than per-chunk accordions -- simpler, and sidesteps Radix
// Accordion's measured-height quirk on short, truncated content.
export function AnswerChunksPanel({
  query,
  keyword,
  chunks,
  retrievedInMs,
  onToggle,
}: {
  query: string;
  keyword: string | null;
  chunks: RetrievedChunk[];
  retrievedInMs?: number;
  // Fires on open AND close -- either direction resizes the scrollable
  // conversation the same way new streamed text does, which the parent
  // uses to briefly suppress Conversation's stick-to-bottom pull (see
  // mentor-chat-client.tsx) so opening this panel doesn't yank the view
  // down to the latest message.
  onToggle?: () => void;
}) {
  if (chunks.length === 0) return null;
  const keywords = splitKeywords(keyword);

  return (
    <Collapsible className="not-prose mb-3 text-xs" onOpenChange={onToggle}>
      <CollapsibleTrigger className="group flex items-center gap-2 leading-none text-muted-foreground transition-colors hover:text-foreground">
        <BookOpenIcon className="size-3.5 shrink-0" />
        <span>
          Searched training material · {chunks.length} ref{chunks.length === 1 ? '' : 's'}
          {typeof retrievedInMs === 'number'
            ? ` · ${(retrievedInMs / 1000).toFixed(1)}s`
            : ''}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 flex flex-col gap-3 rounded-xl border bg-secondary/50 p-3 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <SearchIcon className="mt-0.5 size-3 shrink-0" />
            <span className="italic">{query}</span>
          </p>
          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-px">
              {keywords.map((k) => (
                <Badge key={k} variant="white" className="">
                  {k}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {chunks.map((chunk, i) => (
            <Fragment key={chunk.id}>
              {i > 0 ? <Separator /> : null}
              <div className="flex flex-col gap-1">
                {chunk.sourceLabel ? (
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                    {chunk.sourceLabel}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {truncate(chunk.content, TRUNCATE_AT)}
                </p>
              </div>
            </Fragment>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
