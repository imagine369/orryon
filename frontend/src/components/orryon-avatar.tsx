import { cn } from "@/lib/utils";

type OrryonAvatarProps = {
  /** Pixel width and height of the circle. */
  size: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

/** Renders the portrait avatar without Next/Image resize distortion. */
export function OrryonAvatar({
  size,
  className,
  alt = "Orryon",
  priority,
}: OrryonAvatarProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed aspect; avoids optimizer stretch
    <img
      src="/avatar.png"
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      draggable={false}
      className={cn("aspect-square shrink-0 rounded-full object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
