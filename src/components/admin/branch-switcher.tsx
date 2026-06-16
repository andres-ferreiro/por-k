import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building03Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listBranches } from "@/lib/api/branches.functions";
import { useBranchScope } from "@/lib/branch-scope";
import type { AppRole } from "@/lib/api/context.functions";

const ALL = "__all__";

export function BranchSwitcher({
  roles,
  ownBranchName,
}: {
  roles: AppRole[];
  ownBranchName: string | null;
}) {
  const isOwner = roles.includes("owner");
  const { branchId, setBranchId } = useBranchScope();

  const fn = useServerFn(listBranches);
  const { data: branches } = useQuery({
    queryKey: ["branches", "switcher"],
    queryFn: () => fn(),
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <Icon icon={Building03Icon} className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate font-medium">{ownBranchName ?? "Sin sucursal"}</span>
      </div>
    );
  }

  const value = branchId ?? ALL;

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <Icon icon={Building03Icon} className="h-4 w-4 shrink-0 text-primary" />
      <Select
        value={value}
        onValueChange={(v) => setBranchId(v === ALL ? null : v)}
      >
        <SelectTrigger className="h-8 w-full min-w-0 max-w-[220px] border-0 bg-transparent px-2 text-sm font-medium shadow-none focus-visible:border-0 focus-visible:ring-0">
          <SelectValue placeholder="Todas las sucursales" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las sucursales</SelectItem>
          {(branches ?? []).map((b: any) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
