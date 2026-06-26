import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { BADGE_BASE, badgeToneClasses } from "@/lib/badge-tones";

const badgeVariants = cva(BADGE_BASE, {
  variants: {
    variant: {
      default: badgeToneClasses.primary,
      secondary: badgeToneClasses.neutral,
      destructive: badgeToneClasses.danger,
      outline: badgeToneClasses.neutral,
      success: badgeToneClasses.success,
      warning: badgeToneClasses.warning,
      info: badgeToneClasses.info,
      neutral: badgeToneClasses.neutral,
      primary: badgeToneClasses.primary,
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
