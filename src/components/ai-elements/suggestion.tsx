'use client';

import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';
import { useCallback } from 'react';

export type SuggestionsProps = ComponentProps<typeof Carousel>;

// Built on the same embla carousel as the contacts cards (see
// tools-ui/contacts-carousel.tsx) instead of a plain scrollable div, so
// this row can be panned by holding the mouse down and dragging, not just
// scrolled with Shift+wheel or a trackpad gesture. dragFree keeps it a
// loose, unsnapped scroll since these are variable-width chips, not fixed
// slides.
export const Suggestions = ({ className, children, opts, ...props }: SuggestionsProps) => (
  <Carousel
    opts={{ align: 'start', dragFree: true, containScroll: 'trimSnaps', ...opts }}
    className={cn('w-full pl-2', className)}
    {...props}
  >
    <CarouselContent className="-ml-2 cursor-grab select-none active:cursor-grabbing">
      {children}
    </CarouselContent>
  </Carousel>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <CarouselItem className="basis-auto pl-2">
      <Button
        className={cn('cursor-pointer rounded-full px-4', className)}
        onClick={handleClick}
        size={size}
        type="button"
        variant={variant}
        {...props}
      >
        {children || suggestion}
      </Button>
    </CarouselItem>
  );
};
