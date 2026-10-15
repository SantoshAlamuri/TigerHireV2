"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

interface TigerHireLogoProps {
  variant?: "dark" | "light" | "icon" | "favicon";
  size?: "sm" | "md" | "lg" | "xl";
  tagline?: boolean;
  className?: string;
  /** When set, wraps the logo in a Link to this href (e.g. "/") */
  href?: string;
}

const WORDMARK_ASPECT = 280 / 64;
const SIZES = {
  sm: { height: 24, iconSize: 32 },
  md: { height: 36, iconSize: 48 },
  lg: { height: 48, iconSize: 64 },
  xl: { height: 64, iconSize: 80 },
} as const;

function LogoImage({
  variant,
  size,
  tagline,
  className,
}: Pick<TigerHireLogoProps, "variant" | "size" | "tagline" | "className">) {
  const s = SIZES[size ?? "md"];

  if (variant === "icon") {
    return (
      <Image
        src="/logo-icon.svg"
        alt="TigerHire"
        width={s.iconSize}
        height={s.iconSize}
        className={className}
        priority
      />
    );
  }

  if (variant === "favicon") {
    return (
      <Image
        src="/favicon.svg"
        alt="TigerHire"
        width={s.iconSize}
        height={s.iconSize}
        className={className}
        priority
      />
    );
  }

  const width = Math.round(s.height * WORDMARK_ASPECT);
  const src = variant === "light" ? "/logo-light.svg" : "/logo-dark.svg";

  if (tagline) {
    return (
      <span className={`inline-flex flex-col gap-1 ${className ?? ""}`}>
        <Image
          src={src}
          alt="TigerHire"
          width={width}
          height={s.height}
          className="block"
          priority
        />
        <span className="block pl-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-subtle)]">
          {SITE_MARKETING.logoTagline}
        </span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt="TigerHire"
      width={width}
      height={s.height}
      className={className}
      priority
    />
  );
}

export default function TigerHireLogo({
  variant = "dark",
  size = "md",
  tagline = false,
  className = "",
  href,
}: TigerHireLogoProps) {
  const content = (
    <LogoImage variant={variant} size={size} tagline={tagline} className={className} />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}
