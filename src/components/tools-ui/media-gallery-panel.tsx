'use client';

import { useState } from 'react';
import Image from 'next/image';
import { XIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface MediaGalleryImage {
  publicId: string;
  url: string;
  width: number;
  height: number;
  label: string;
}

// Rendered for the searchMedia tool's output (see conversation-messages.tsx's
// 'tool-searchMedia' case) -- a small strip of real reference photos, not
// described in text. `cursor-zoom-in` is the actual browser-native
// magnifying-glass-with-plus cursor, not a custom icon overlay, for the
// hover affordance; clicking opens the full image in Dialog, whose own
// DialogOverlay (see ui/dialog.tsx) already gives the blurred-backdrop +
// zoom-in-95 "grows into a modal" animation this was asked for, so none
// of that needed rebuilding here.
export function MediaGalleryPanel({ images }: { images: MediaGalleryImage[] }) {
  const [openImage, setOpenImage] = useState<MediaGalleryImage | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="not-prose flex flex-wrap gap-3 py-2">
        {images.map((image) => (
          <button
            key={image.publicId}
            type="button"
            onClick={() => setOpenImage(image)}
            className="group relative size-28 shrink-0 cursor-zoom-in overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow hover:shadow-lg sm:size-36"
          >
            <Image
              src={image.url}
              alt={image.label}
              fill
              sizes="144px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={openImage !== null} onOpenChange={(open) => !open && setOpenImage(null)}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          {/* Radix requires an accessible title; the image's own alt text
              already says what it is, so this is sr-only, not a visible
              caption -- a blown-up reference photo doesn't need a label
              fighting for attention over it. */}
          <DialogTitle className="sr-only">{openImage?.label ?? 'Reference photo'}</DialogTitle>
          {/* DialogContent's own built-in close button (showCloseButton)
              only shows its background on actual hover -- fine against a
              normal popover's bg-popover, but invisible/hard to spot
              floating over an arbitrary photo here, so this one carries
              the ghost variant's hover look (bg-muted/text-foreground) as
              its resting state instead of waiting for a hover to show it. */}
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4 bg-muted text-foreground hover:bg-muted/70"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
          {openImage ? (
            <Image
              src={openImage.url}
              alt={openImage.label}
              width={openImage.width}
              height={openImage.height}
              className="h-auto max-h-[80vh] w-full rounded-xl object-contain"
              priority
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
