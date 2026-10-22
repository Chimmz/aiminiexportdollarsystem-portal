import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MapPin, Phone, Mail, Globe, AtSign } from 'lucide-react';
import type { ContactCard } from '@/lib/utils/contacts-utils';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bolds wherever the search query actually matched, word by word rather
// than as one exact phrase -- a query like "palm oil" is matched by
// full-text search as "has palm AND has oil" (see contacts-utils.ts), not
// as that literal two-word phrase, so highlighting looks for each word on
// its own. Plain substring per word, same matching philosophy as the rest
// of this search -- bolding "carton" inside "cartons" works for free.
function highlightMatches(text: string, query: string): React.ReactNode {
  const words = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
  if (words.length === 0) return text;

  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  return text
    .split(pattern)
    .map((chunk, i) => (i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk));
}

// A phone field can hold more than one number joined with " / " (see
// lib/utils/contacts-utils.ts's local-supplier card builder) -- a single
// tel: link wouldn't make sense for that, so those render as plain text
// instead.
function telHref(phone: string): string | null {
  if (/[/|]/.test(phone)) return null;
  return `tel:${phone.replace(/\s+/g, '')}`;
}

// website/instagram fields are free text from the source sheets, not
// guaranteed to be any one format -- could be a bare handle ("@name"), a
// full URL already, or just a domain with no protocol. This resolves
// whatever it can into a real link, or returns null to render as plain
// text rather than a broken href.
function resolveUrl(value: string): string | null {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.|instagram\.com|wa\.me)/i.test(v)) return `https://${v}`;
  if (/^@[\w.]+$/.test(v)) return `https://instagram.com/${v.slice(1)}`;
  return null;
}

function ContactLink({
  icon: Icon,
  href,
  children,
}: {
  icon: typeof Phone;
  href: string | null;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </>
  );
  if (!href) {
    return <div className="flex items-center gap-2 text-foreground/90">{content}</div>;
  }
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-2 text-foreground/90 hover:text-primary"
    >
      {content}
    </a>
  );
}

// A phone field holding more than one number (see telHref above) still
// needs the full list somewhere -- shown on hover/focus instead of inline,
// one number per line, rather than letting the truncated text swallow the
// second number entirely.
function PhoneField({ phone }: { phone: string }) {
  const numbers = phone
    .split(/[/|]/)
    .map((n) => n.trim())
    .filter(Boolean);

  if (numbers.length <= 1) {
    return (
      <ContactLink icon={Phone} href={telHref(phone)}>
        {phone}
      </ContactLink>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger className="flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left text-foreground/90">
        <Phone className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{phone}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="flex flex-col gap-0.5">
          {numbers.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// contact.summary is either plain text (e.g. a buyer_type/supplier_group
// category, or a logistics offer) or "<Label>: <item> | <item> | ..." for
// a products/services list (see the to*Card mappers in contacts-utils.ts)
// -- only the second shape gets broken into badges, rather than guessing
// at every possible summary format.
function SummaryField({ summary, query }: { summary: string; query: string }) {
  const match = summary.match(/^([^:]+):\s*(.+)$/);
  const items = match?.[2].includes('|')
    ? match[2]
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
    : null;

  if (!match || !items) {
    return (
      <p className="text-sm text-foreground/90">{highlightMatches(summary, query)}</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-foreground/90">{match[1].trim()}:</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="outline">
            {highlightMatches(item, query)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// Rendered for the searchContacts tool's output (see
// mentor-chat-client.tsx's 'tool-searchContacts' case) instead of Eva
// listing contact details out in text. The cards carry all the visual
// weight -- the carousel itself has no background or padding of its own.
export function ContactsCarousel({
  contacts,
  query,
}: {
  contacts: ContactCard[];
  query: string;
}) {
  if (contacts.length === 0) return null;

  return (
    <div className="py-5">
      <Carousel opts={{ align: 'start' }}>
        <CarouselContent className="p-3">
          {contacts.map((contact, i) => {
            return (
              <CarouselItem key={i} className="basis-1/1 md:basis-1/2">
                <div className="flex h-full flex-col gap-3 rounded-2xl bg-card p-5 shadow-lg ring-1 ring-foreground/10">
                  <div className="flex items-start gap-3">
                    <Avatar size="lg">
                      <AvatarFallback>{initials(contact.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-semibold text-foreground"
                        title={contact.name}
                      >
                        {contact.name}
                      </p>
                      {contact.location ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={13} className="mb-1" />
                          {contact.location}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {contact.summary ? (
                    <SummaryField summary={contact.summary} query={query} />
                  ) : null}

                  {contact.phone ||
                  contact.email ||
                  contact.website ||
                  contact.instagram ? (
                    <>
                      <Separator className="my-6" />
                      <div className="flex flex-col gap-1.5 text-sm">
                        {contact.phone ? <PhoneField phone={contact.phone} /> : null}
                        {contact.email ? (
                          <ContactLink icon={Mail} href={`mailto:${contact.email}`}>
                            {contact.email}
                          </ContactLink>
                        ) : null}
                        {contact.website ? (
                          <ContactLink icon={Globe} href={resolveUrl(contact.website)}>
                            {contact.website}
                          </ContactLink>
                        ) : null}
                        {contact.instagram ? (
                          <ContactLink icon={AtSign} href={resolveUrl(contact.instagram)}>
                            {contact.instagram}
                          </ContactLink>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {contact.extra ? (
                    <p className="text-xs text-muted-foreground">
                      {highlightMatches(contact.extra, query)}
                    </p>
                  ) : null}

                  {contact.priceNote ? (
                    <p className="text-xs text-muted-foreground">{contact.priceNote}</p>
                  ) : null}
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        {/* Default shadcn position sits -3rem outside the carousel's own
            box (-left-12/-right-12), which depends on whatever wraps this
            having that much spare room -- pulled inward instead so the
            buttons are always inside the visible area regardless of this
            component's own padding. */}
        <CarouselPrevious className="-left-3" />
        <CarouselNext className="-right-3" />
      </Carousel>
    </div>
  );
}
