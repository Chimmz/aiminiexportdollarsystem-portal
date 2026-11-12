'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from 'cn';
import { Skeleton } from './skeleton';

type LoadingImageProps = ImageProps & {
  skeletonClassName?: string;
};

// Drop-in replacement for next/image's <Image> that shows a skeleton until
// the real image decodes, instead of popping from an empty box straight to
// the loaded photo. Only meant for `fill` usage (the gallery/thumbnail
// case) -- it needs the same positioned (relative, overflow-hidden)
// ancestor `fill` itself requires, and layers the skeleton into that same
// box via `absolute inset-0` rather than wrapping its own.
export function LoadingImage({ className, skeletonClassName, ...imgProps }: LoadingImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Skeleton
        aria-hidden="true"
        className={cn('absolute inset-0 bg-gray-200', loaded && 'opacity-0', skeletonClassName)}
      />
      <Image
        {...imgProps}
        className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
        onLoad={(e) => {
          setLoaded(true);
          imgProps.onLoad?.(e);
        }}
      />
    </>
  );
}
