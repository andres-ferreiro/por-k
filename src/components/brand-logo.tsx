import { cn } from "@/lib/utils";
import { APP_LOGO_SRC, APP_NAME } from "@/lib/brand";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "sidebar";
}

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-24 w-24",
  sidebar:
    "h-28 w-28 object-contain object-center group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8",
};

export function BrandLogo({ className, size = "sm" }: BrandLogoProps) {
  return (
    <img
      src={APP_LOGO_SRC}
      alt={APP_NAME}
      className={cn("shrink-0 object-contain", sizeClass[size], className)}
    />
  );
}
