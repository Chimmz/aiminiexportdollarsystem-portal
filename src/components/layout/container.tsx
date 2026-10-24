import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      // 2xl:max-w-4xl!
      className={cn('container mx-auto lg:max-w-2xl! xl:max-w-3xl!', className)}
      {...props}
    />
  );
}
