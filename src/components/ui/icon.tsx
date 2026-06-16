import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

function sizeFromClassName(className?: string): number | undefined {
  const match = className?.match(/(?:^|\s)(?:size-|h-)(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  return Number(match[1]) * 4;
}

export interface IconProps {
  icon: IconSvgElement;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ icon, className, size, strokeWidth = 1.5 }: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      className={cn("shrink-0", className)}
      size={size ?? sizeFromClassName(className) ?? 16}
      strokeWidth={strokeWidth}
      primaryColor="currentColor"
    />
  );
}
