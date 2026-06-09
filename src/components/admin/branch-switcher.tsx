import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>{ownBranchName ?? "Sin sucursal"}</span>
      </div>
    );
  }

  const value = branchId ?? ALL;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={value}
        onValueChange={(v) => setBranchId(v === ALL ? null : v)}
      >
        <SelectTrigger className="h-8 w-56 text-sm">
          <SelectValue placeholder="Toda la empresa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toda la empresa</SelectItem>
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
