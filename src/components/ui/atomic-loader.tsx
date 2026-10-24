import { cn } from 'cn';

// Dual counter-rotating rings -- the chat's "Eva is thinking" indicator,
// distinct from the generic single-ring Spinner (ui/spinner.tsx) used for
// inline button/async states elsewhere. Border color comes from
// currentColor (see .loader-rings in globals.css), so it follows whatever
// text-* class is passed in rather than being fixed here.
function AtomicLoader({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="loader"
      role="status"
      aria-label="Loading"
      className={cn('loader-rings inline-block', className)}
      {...props}
    />
  );
}

export { AtomicLoader };
