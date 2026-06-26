import {
  DeliveryTruck01Icon,
  PackageDelivered01Icon,
  ReceiptTextIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { getLiveOperations } from "@/lib/api/admin.functions";
import { fmtMoney } from "@/lib/format";
import { APP_LOCALE, APP_TZ } from "@/lib/tz";
import { cn } from "@/lib/utils";

type LiveData = Awaited<ReturnType<typeof getLiveOperations>>;
type Activity = LiveData["activity"][number];

const TYPE_META: Record<
  Activity["type"],
  { icon: typeof PackageDelivered01Icon; cls: string }
> = {
  delivery: { icon: PackageDelivered01Icon, cls: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700" },
  payment: { icon: Wallet01Icon, cls: "border-sky-600/40 bg-sky-500/10 text-sky-700" },
  expense: { icon: ReceiptTextIcon, cls: "border-amber-600/40 bg-amber-500/10 text-amber-700" },
  dispatch: { icon: DeliveryTruck01Icon, cls: "border-violet-600/40 bg-violet-500/10 text-violet-700" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(APP_LOCALE, {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActivityRow({ item }: { item: Activity }) {
  const meta = TYPE_META[item.type];
  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className={cn("h-9 w-9 rounded-lg border flex items-center justify-center shrink-0", meta.cls)}>
        <Icon icon={meta.icon} className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-sm">{item.title}</div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{fmtTime(item.at)}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</div>
        {item.amount != null && item.amount > 0 && (
          <div className="text-xs font-semibold tabular-nums mt-1">{fmtMoney(item.amount)}</div>
        )}
      </div>
    </div>
  );
}

export function LiveOperationsFeed({ data }: { data: LiveData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-xl border bg-card">
        <div className="px-4 py-3 border-b font-medium text-sm">Actividad reciente</div>
        <div className="px-4 max-h-[560px] overflow-y-auto">
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sin actividad hoy.</p>
          ) : (
            data.activity.map((item) => <ActivityRow key={item.id} item={item} />)
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b font-medium text-sm">Pagos de hoy</div>
          <div className="px-4 py-2 max-h-[240px] overflow-y-auto divide-y">
            {data.recent_payments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Sin pagos</p>
            ) : (
              data.recent_payments.slice(0, 12).map((p) => (
                <div key={p.id} className="py-2.5 flex justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.customer_name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{p.route_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{fmtMoney(p.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtTime(p.paid_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b font-medium text-sm">Gastos de hoy</div>
          <div className="px-4 py-2 max-h-[240px] overflow-y-auto divide-y">
            {data.recent_expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Sin gastos</p>
            ) : (
              data.recent_expenses.slice(0, 12).map((e) => (
                <div key={e.id} className="py-2.5 flex justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.description}</div>
                    <div className="text-[10px] text-muted-foreground">{e.route_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums text-rose-600">{fmtMoney(e.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtTime(e.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
