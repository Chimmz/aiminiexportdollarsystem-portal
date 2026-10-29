import { cn } from 'cn';

// A single blob that continuously morphs through organic, amoeba-like
// silhouettes (clip-path: shape(), see .loader-amoeboid in globals.css) --
// unlike AtomicLoader's two fixed rings, there's no repeating geometric
// structure here, the whole point is that it never settles into one
// shape. Fill color comes from currentColor, so it follows whatever
// text-* class is passed in rather than being fixed here.
function AmoeboidLoader({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="loader"
      role="status"
      aria-label="Loading"
      className={cn('loader-amoeboid inline-block', className)}
      {...props}
    />
  );
}

export { AmoeboidLoader };
