"use client";

interface SkeletonProps {
  className?: string;
  /** Shape of the skeleton block. Defaults to "rect". */
  shape?: "rect" | "circle";
}

export function Skeleton({ className = "", shape = "rect" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`skeleton-pulse ${shape === "circle" ? "rounded-full" : "rounded-md"} ${className}`}
    />
  );
}
