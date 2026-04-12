"use client";

import Link from "next/link";

type Variant = "primary" | "secondary" | "calm";

interface PillLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface PillButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

const base = (size: "sm" | "md" | "lg") =>
  `relative overflow-hidden group rounded-full inline-flex items-center justify-center uppercase tracking-[3px] border transition-colors duration-300 ${
    size === "sm"
      ? "px-5 py-2 text-xs"
      : size === "lg"
      ? "px-10 py-4 text-base"
      : "px-8 py-3 text-sm"
  }`;

const fillClass = (variant: Variant) => {
  const fill =
    variant === "primary" ? "bg-black"
    : variant === "calm"   ? "bg-[#4a85c0]"
    : "bg-white";
  return `absolute inset-0 ${fill} -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`;
};

const textClass = (variant: Variant) =>
  `relative z-10 transition-colors duration-300 ${
    variant === "secondary"
      ? "text-white group-hover:text-black"
      : "text-black group-hover:text-white"
  }`;

const borderClass = (variant: Variant) =>
  variant === "secondary" ? "border-white/40" : "border-white";

const bgClass = (variant: Variant) =>
  variant === "secondary" ? "bg-black" : "bg-white";

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
