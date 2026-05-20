import Image from "next/image";
import { cn } from "@/lib/utils";

type OrryonAvatarProps = {
  /** Pixel width and height of the circle. */
  size: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

/** Square avatar frame — never stretches the source image. */
export function OrryonAvatar({
  size,
  className,
  alt = "Orryon",
  priority,
}: OrryonAvatarProps) {
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/avatar.png"
        alt={alt}
        fill
        sizes={`${size}px`}
        className="object-cover object-[center_12%]"
        priority={priority}
        draggable={false}
      />
    </span>
  );
}
