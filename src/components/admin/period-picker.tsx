import { type Period, type DateRange } from "@/hooks/use-dashboard-period";
import { cn } from "@/lib/utils";
import { FilterDateRangePicker } from "@/components/admin/data-table";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "year", label: "Año" },
  { id: "custom", label: "Personalizado" },
];

export function PeriodPicker({
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  exclude,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  customRange: DateRange | null;
  onCustomRangeChange: (r: DateRange) => void;
  /** Period ids to hide, e.g. ["month","year"] for driver */
  exclude?: Period[];
}) {
  const visible = PERIODS.filter((p) => !exclude?.includes(p.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border bg-muted p-0.5 gap-0.5">
        {visible.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPeriodChange(id)}
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              period === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <FilterDateRangePicker
          from={customRange?.from ?? ""}
          to={customRange?.to ?? ""}
          onFromChange={(from) => {
            const to = customRange?.to ?? from;
            onCustomRangeChange({ from, to });
          }}
          onToChange={(to) => {
            const from = customRange?.from ?? to;
            onCustomRangeChange({ from, to });
          }}
          placeholder="Seleccionar rango"
        />
      )}
    </div>
  );
}
