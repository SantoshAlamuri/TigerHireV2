"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  variant?: "fade-up" | "scale" | "stagger";
  delay?: number;
  threshold?: number;
}

export default function ScrollReveal({
  children,
  className = "",
  variant = "fade-up",
  delay = 0,
  threshold = 0.15,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => el.classList.add("visible"), delay);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, threshold]);

  const base =
    variant === "scale" ? "reveal-scale" : variant === "stagger" ? "reveal-stagger" : "reveal";

  return (
    <div ref={ref} className={`${base} ${className}`}>
      {children}
    </div>
  );
}
