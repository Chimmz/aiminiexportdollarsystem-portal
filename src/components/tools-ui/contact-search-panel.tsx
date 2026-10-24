'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDownIcon,
  FileTextIcon,
  type LucideIcon,
  SearchIcon,
  TruckIcon,
  UserGroup,
  UsersIcon,
  WarehouseIcon,
} from 'lucide-react';
import type { ContactCard, ContactType } from '@/lib/utils/contacts-utils';

// One icon/label per directory, shown as badges below the search line so
// a mixed-directory result (e.g. a query with no contactTypes filter,
// which searches all four) is visually broken down by which directories
// actually turned up something, not just a flat count. Icon choices:
// Users for sourcing-side people, Truck for moving goods, FileText for
// paperwork, Globe-ish feel for buyers abroad covered by UsersIcon's
// international-buyer badge having its own icon below.
const CONTACT_TYPE_META: Record<ContactType, { icon: LucideIcon; label: string }> = {
  intl_buyers: { icon: UsersIcon, label: 'International buyers' },
  local_suppliers: { icon: WarehouseIcon, label: 'Local suppliers' },
  logistics_packaging: { icon: TruckIcon, label: 'Logistics & packaging' },
  documentation: { icon: FileTextIcon, label: 'Documentation' },
};

// Rendered alongside (above, not instead of) ContactsCarousel for the
// searchContacts tool's output -- the carousel stays the main,
// always-visible result, same as before. This is the technical detail
// around it: what was actually searched and which directories it came
// from, collapsed by default, same pattern as SearchKbPanel and
// MemoryUpdatesPanel.
export function ContactSearchPanel({
  query,
  locations,
  contacts,
  note,
  onToggle,
}: {
  query: string;
  locations: string[] | null;
  contacts: ContactCard[];
  note?: string;
  onToggle?: () => void;
}) {
  if (contacts.length === 0) return null;

  const presentTypes = [...new Set(contacts.map((c) => c.type))];

  return (
    <Collapsible className="not-prose mb-3 text-xs" onOpenChange={onToggle}>
      <CollapsibleTrigger className="group flex items-center gap-2 leading-none text-muted-foreground transition-colors hover:text-foreground">
        <UserGroup className="size-3.5 shrink-0" />
        <span>Searched contact directories · {contacts.length} found</span>
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-3 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <SearchIcon className="mt-0.5 size-3 shrink-0" />
            <span className="italic">
              {query}
              {locations && locations.length > 0 ? ` · ${locations.join(', ')}` : ''}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {presentTypes.map((type) => {
              const meta = CONTACT_TYPE_META[type];
              const Icon = meta.icon;
              return (
                <Badge key={type} variant="outline" className="gap-1">
                  <Icon className="size-3" />
                  {meta.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {note ? <p className="text-muted-foreground">{note}</p> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
