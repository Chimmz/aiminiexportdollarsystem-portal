"use client";

import { BookOpenIcon, DownloadIcon, UsersIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resources } from "@/lib/mock-data/resources";
import { FadeIn, HoverLift } from "@/components/motion/fade-in";

export default function ResourcesPage() {
  return (
    <div className="space-y-12 px-8 py-14">
      <FadeIn className="space-y-2">
        <h1 className="text-2xl font-semibold">
          Your Resources ({resources.length})
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The guide and bonus contact lists that came with your purchase. Tap
          one to see what&apos;s inside. Download-only for now — no preview.
        </p>
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
                            {resource.id === "main-guide" ? (
                              <BookOpenIcon className="size-4" />
                            ) : (
                              <UsersIcon className="size-4" />
                            )}
                          </span>
                          {resource.title}
                        </AccordionTrigger>
                        {/* Placeholder href — point at real file URLs once they exist. */}
                        <Button asChild size="sm" variant="outline">
                          <a href="#" aria-label={`Download ${resource.title}`}>
                            <DownloadIcon className="size-4" />
                            Download
                          </a>
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
    </div>
  );
}
