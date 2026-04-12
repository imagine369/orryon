"use client";

import Link from "next/link";

interface PillLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
}

interface PillButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

const base = (size: "sm" | "md") =>
  `relative overflow-hidden group rounded-full inline-flex items-center justify-center uppercase tracking-[3px] border transition-colors duration-300 ${
    size === "sm" ? "px-5 py-2 text-xs" : "px-8 py-3 text-sm"
  }`;

const fillClass = (variant: "primary" | "secondary") =>
  `absolute inset-0 ${variant === "primary" ? "bg-black" : "bg-white"} -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`;

const textClass = (variant: "primary" | "secondary") =>
  `relative z-10 transition-colors duration-300 ${
    variant === "primary"
      ? "text-black group-hover:text-white"
      : "text-white group-hover:text-black"
  }`;

const borderClass = (variant: "primary" | "secondary") =>
  variant === "primary" ? "border-white" : "border-white/40";

const bgClass = (variant: "primary" | "secondary") =>
  variant === "primary" ? "bg-white" : "bg-black";

export function PillLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: PillLinkProps) {
  return (
    <Link href={href} className={`${base(size)} ${borderClass(variant)} ${bgClass(variant)} ${className}`}>
      <span className={fillClass(variant)} aria-hidden />
      <span className={textClass(variant)}>{children}</span>
    </Link>
  );
}

export function PillButton({
  onClick,
  children,
  variant = "primary",
  size = "md",
  disabled,
  className = "",
}: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base(size)} ${borderClass(variant)} ${bgClass(variant)} ${className} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className={fillClass(variant)} aria-hidden />
      <span className={textClass(variant)}>{children}</span>
    </button>
  );
}
