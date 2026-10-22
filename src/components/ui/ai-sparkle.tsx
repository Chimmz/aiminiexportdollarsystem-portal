type TProps = {
  size?: number;
  color?: string;
  className?: string;
  // Color stops for a gradient fill instead of a solid color — e.g. to
  // match a gradient used on adjacent text (see dashboard-home-client.tsx's
  // "Chat with Eva"). Overrides `color` when set. Fixed gradient id is fine
  // today since at most one gradient AISparkle renders per page; give it a
  // unique id via a `gradientId` prop if that ever stops being true.
  gradient?: string[];
  gradientId?: string;
};

/** Single Gemini-style 4-pointed sparkle, filled */
export function AISparkle({
  size = 24,
  color = 'var(--accent-gold)',
  className,
  gradient,
  gradientId = 'ai-sparkle-gradient',
}: TProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={gradient ? `url(#${gradientId})` : color}
      className={className}
      aria-hidden="true"
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradient.map((stopColor, i) => (
              <stop
                key={stopColor}
                offset={`${(i / (gradient.length - 1)) * 100}%`}
                stopColor={stopColor}
              />
            ))}
          </linearGradient>
        </defs>
      )}
      <path d="M12 2C12 7.52 16.48 12 22 12C16.48 12 12 16.48 12 22C12 16.48 7.52 12 2 12C7.52 12 12 7.52 12 2Z" />
    </svg>
  );
}

/** Double Gemini-style sparkle (large + small), filled */
export function AISparkles({ size = 24, color = 'var(--accent-gold)', className }: TProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      className={className}
      aria-hidden="true"
    >
      <path d="M10 5C10.3 10.4 13.6 13.7 19 14C13.6 14.3 10.3 17.6 10 23C9.7 17.6 6.4 14.3 1 14C6.4 13.7 9.7 10.4 10 5Z" />
      <path d="M20 0C20.1 2.4 21.6 3.9 24 4C21.6 4.1 20.1 5.6 20 8C19.9 5.6 18.4 4.1 16 4C18.4 3.9 19.9 2.4 20 0Z" />
    </svg>
  );
}
