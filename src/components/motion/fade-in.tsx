"use client";

import { motion, type HTMLMotionProps } from "motion/react";

type FadeInProps = HTMLMotionProps<"div"> & {
  delay?: number;
};

// Standard page-section entrance: fade + slight rise. Stack several with
// increasing `delay` (0, 0.08, 0.16, ...) for a staggered feel.
export function FadeIn({ delay = 0, children, ...props }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type HoverLiftProps = HTMLMotionProps<"div">;

// Wrap an interactive card to give it a gentle lift + deeper shadow on
// hover and a tactile press-down on tap.
export function HoverLift({ children, ...props }: HoverLiftProps) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ y: 0, scale: 0.99 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
