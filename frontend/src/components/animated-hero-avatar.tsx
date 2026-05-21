"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const AVATAR_FLOAT_PROPS = {
  animate: { y: [0, -6, 0], scale: [1, 1.025, 1] },
  transition: { duration: 3.8, ease: "easeInOut" as const, repeat: Infinity, repeatType: "loop" as const },
};

const SIZE_CONFIG = {
  hero: {
    width: 195,
    height: 195,
    imageClass:
      "w-[150px] h-[150px] sm:w-[155px] sm:h-[155px] lg:w-[195px] lg:h-[195px] rounded-full object-contain ring-1 ring-white/10",
  },
  orbit: {
    width: 103,
    height: 103,
    imageClass: "rounded-full object-contain ring-1 ring-white/10",
  },
  orbitMobile: {
    width: 64,
    height: 64,
    imageClass: "rounded-full object-contain ring-1 ring-white/10",
  },
} as const;

export type HeroAvatarSize = keyof typeof SIZE_CONFIG;

type AnimatedHeroAvatarProps = {
  size?: HeroAvatarSize;
  alt?: string;
  priority?: boolean;
  wrapperClassName?: string;
};

export function AnimatedHeroAvatar({
  size = "hero",
  alt = "Orryon",
  priority,
  wrapperClassName,
}: AnimatedHeroAvatarProps) {
  const { width, height, imageClass } = SIZE_CONFIG[size];
  return (
    <motion.div className={wrapperClassName} {...AVATAR_FLOAT_PROPS}>
      <Image
        src="/avatar.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={imageClass}
      />
    </motion.div>
  );
}

export function HeroAvatarSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(SIZE_CONFIG.hero.imageClass, "bg-white/10 animate-pulse", className)}
      aria-hidden
    />
  );
}
