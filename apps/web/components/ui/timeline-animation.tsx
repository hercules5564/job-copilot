"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { motion, useInView, type Variants } from "framer-motion";

/**
 * Lightweight scroll-timeline wrapper used by the pricing section.
 * `timelineRef` lets several elements share one observer (the section root);
 * each element uses `animationNum` as the custom variant index for delays.
 */
export function TimelineContent({
  as = "div",
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  children,
}: {
  as?: string;
  animationNum?: number;
  timelineRef?: RefObject<HTMLElement>;
  customVariants?: Variants;
  className?: string;
  children?: ReactNode;
}) {
  const localRef = useRef<HTMLDivElement>(null);
  const inView = useInView(timelineRef ?? localRef, { once: true, amount: 0.1 });
  void as;

  return (
    <motion.div
      ref={localRef}
      custom={animationNum}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={customVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
