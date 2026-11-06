'use client';

import Image from 'next/image';
import { BookOpenIcon, DownloadIcon, UsersIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { resources } from '@/lib/mock-data/resources';
import { FadeIn, HoverLift } from '@/components/motion/fade-in';
import { useResourceDownload } from '@/hooks/use-resource-download';
import { Container } from '@/components/layout/container';

export default function ResourcesPage() {
  const { downloadingId, download } = useResourceDownload();

  // Explicit here rather than left to DashboardMain's own automatic wrap
  // (see that component's own comment) -- dashboard-main.tsx excludes
  // this exact route from that wrap now, so this is the only Container
  // around this page's content, not a second one nested inside it.
  return (
    <Container className="space-y-12 px-8 py-14">
      <FadeIn className="space-y-2">
        <h1 className="text-2xl font-semibold">Your Resources ({resources.length})</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The guide and bonus contact lists that came with your purchase. Download them to
          see what&apos;s inside.
        </p>
      </FadeIn>

      <FadeIn delay={0.03}>
        <Image
          src="/mini-export-bundle.webp"
          alt="The Mini Export Dollar System guide, bundled with all 3 bonus contact lists"
          width={1264}
          height={848}
          className="h-auto w-full rounded-2xl shadow-soft"
          priority
        />
      </FadeIn>

      <div className="space-y-6">
        {resources.map((resource, index) => (
          <FadeIn key={resource.id} delay={0.05 + index * 0.05}>
            <HoverLift>
              <Card className="bg-gradient-to-br from-background-subtle to-background py-0">
                <CardContent className="px-0">
                  <Accordion type="single" collapsible>
                    <AccordionItem value={resource.id}>
                      <div className="flex items-center justify-between gap-3 px-5 py-5">
                        <AccordionTrigger className="items-center gap-3 p-0 hover:no-underline">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-foreground">
                            {resource.id === 'main-guide' ? (
                              <BookOpenIcon className="size-4" />
                            ) : (
                              <UsersIcon className="size-4" />
                            )}
                          </span>
                          {resource.title}
                        </AccordionTrigger>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingId === resource.id}
                          aria-label={`Download ${resource.title}`}
                          onClick={() => download(resource.id, `${resource.title}.pdf`)}
                        >
                          {downloadingId === resource.id ? (
                            <>
                              <Spinner className="size-4" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <DownloadIcon className="size-4" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                      <AccordionContent className="px-5">
                        <p>{resource.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {resource.meta}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </HoverLift>
          </FadeIn>
        ))}
      </div>
    </Container>
  );
}
