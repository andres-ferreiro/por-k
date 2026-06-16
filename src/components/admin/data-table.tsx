
import { useState } from "react";
import { ArrowDown01Icon, ArrowUp01Icon, ArrowUpDownIcon, Calendar03Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dateRangeToStrings, fmtDateMedium, fmtDateShort, parseDateStr, toDateStr } from "@/lib/format";
import type { SortDirection } from "@/hooks/use-sorting";
import type { DateRange } from "react-day-picker";

/** White card-style surface for toolbar search and filters */
const filterSurface =
  "bg-white border-[#e1e4ea] shadow-none hover:bg-white focus-visible:bg-white";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-sm mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function TableToolbar({
  search,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  filters,
  actions,
}: {
  search?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const showToolbar = search || filters || actions;
  if (!showToolbar) return null;

  const hasSearchValue = Boolean(searchValue?.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {search && (
          <div className="relative w-full sm:w-72 lg:w-80 sm:shrink-0">
            <Icon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className={cn("h-10 pl-9 pr-9 text-sm", filterSurface)}
              placeholder={searchPlaceholder}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
            {hasSearchValue && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => onSearchChange?.("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon icon={Cancel01Icon} className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {actions && (
          <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto justify-end">{actions}</div>
        )}
      </div>
      {filters && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin">
          {filters}
        </div>
      )}
    </div>
  );
}

export function FilterSelect({
  value,
  onValueChange,
  placeholder,
  className,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("h-10 w-auto min-w-[8rem] max-w-[14rem] shrink-0 text-sm font-normal gap-2 px-3", filterSurface, className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/** @deprecated Use FilterDatePicker or FilterDateRangePicker */
export function FilterDate({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-10 w-[10.5rem] text-sm px-3", className)}
    />
  );
}

export function FilterDatePicker({
  value,
  onChange,
  className,
  placeholder = "Seleccionar fecha",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateStr(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 shrink-0 justify-start gap-2 px-3 text-sm font-normal",
            filterSurface,
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Icon icon={Calendar03Icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value ? fmtDateMedium(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toDateStr(date));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function FilterDateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  className,
  placeholder = "Rango de fechas",
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected: DateRange | undefined =
    from
      ? { from: parseDateStr(from), to: to ? parseDateStr(to) : parseDateStr(from) }
      : undefined;

  const label =
    from && to
      ? from === to
        ? fmtDateShort(from)
        : `${fmtDateShort(from)} — ${fmtDateShort(to)}`
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 shrink-0 justify-start gap-2 px-3 text-sm font-normal min-w-[10.5rem]",
            filterSurface,
            !from && "text-muted-foreground",
            className,
          )}
        >
          <Icon icon={Calendar03Icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          defaultMonth={selected?.from}
          numberOfMonths={1}
          onSelect={(range) => {
            const parsed = dateRangeToStrings(range);
            if (!parsed) return;
            onFromChange(parsed.from);
            onToChange(parsed.to);
            if (range?.from && range?.to) {
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function StatusFilterSelect({
  value,
  onValueChange,
  activeLabel = "Activos",
  inactiveLabel = "Inactivos",
}: {
  value: string;
  onValueChange: (v: string) => void;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <FilterSelect value={value} onValueChange={onValueChange} placeholder="Estado">
      <SelectItem value="all">Todos</SelectItem>
      <SelectItem value="active">{activeLabel}</SelectItem>
      <SelectItem value="inactive">{inactiveLabel}</SelectItem>
    </FilterSelect>
  );
}

export function DataTableCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">
        {children}
      </div>
    </Card>
  );
}

export function SortableTableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const sortIcon = !active
    ? ArrowUpDownIcon
    : direction === "asc"
      ? ArrowUp01Icon
      : ArrowDown01Icon;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded-sm"
      >
        {label}
        <Icon
          icon={sortIcon}
          className={cn("h-3.5 w-3.5", active ? "text-foreground" : "text-muted-foreground/60")}
        />
      </button>
    </TableHead>
  );
}

export function TableStatusRow({
  colSpan,
  loading,
  empty,
  loadingMessage = "Cargando…",
  emptyMessage = "Sin resultados.",
}: {
  colSpan: number;
  loading?: boolean;
  empty?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
}) {
  if (!loading && !empty) return null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10 text-sm">
        {loading ? loadingMessage : emptyMessage}
      </TableCell>
    </TableRow>
  );
}
