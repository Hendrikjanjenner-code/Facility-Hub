import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UtensilsCrossed,
  Clock,
  MapPin,
  Users,
  Package,
  Printer,
  CheckCircle2,
  Circle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  bevestigd: "bg-blue-100 text-blue-800 border-blue-200",
  ingecheckt: "bg-green-100 text-green-800 border-green-200",
  uitgecheckt: "bg-gray-100 text-gray-800 border-gray-200",
  geannuleerd: "bg-red-100 text-red-800 border-red-200",
};

type SummaryReservation = {
  id: number;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  roomName: string | null;
  buildingName: string | null;
  attendees: number | null;
  cateringDeliveredAt: string | null;
  items: { id: number; cateringItemId: number; itemName: string | null; quantity: number; unitPrice: number }[];
};

type DailySummary = {
  date: string;
  reservations: SummaryReservation[];
  totals: { cateringItemId: number; itemName: string; totalQuantity: number }[];
};

async function fetchDailySummary(dateStr: string): Promise<DailySummary> {
  const res = await fetch(`/api/catering/daily-summary?date=${dateStr}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Ophalen mislukt");
  return res.json();
}

export default function CateringPage() {
  const { t } = useTranslation("catering");
  const [date, setDate] = useState<Date>(new Date());
  const [printDate, setPrintDate] = useState<Date>(new Date());
  const [showCancelledInPrint, setShowCancelledInPrint] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");
  const printDateStr = format(printDate, "yyyy-MM-dd");

  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["catering-daily-summary", dateStr],
    queryFn: () => fetchDailySummary(dateStr),
  });

  const {
    data: printSummary,
    isFetching: isPrintFetching,
    isError: isPrintError,
  } = useQuery({
    queryKey: ["catering-daily-summary", printDateStr],
    queryFn: () => fetchDailySummary(printDateStr),
    staleTime: 60_000,
  });

  const { mutate: toggleDelivered, isPending: isToggling } = useMutation({
    mutationFn: async (reservationId: number) => {
      const res = await fetch(`/api/catering/reservations/${reservationId}/delivered`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Markeren mislukt");
      return res.json() as Promise<{ id: number; cateringDeliveredAt: string | null }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<DailySummary>(["catering-daily-summary", dateStr], (old) => {
        if (!old) return old;
        return {
          ...old,
          reservations: old.reservations.map((r) =>
            r.id === data.id ? { ...r, cateringDeliveredAt: data.cateringDeliveredAt } : r
          ),
        };
      });
    },
  });

  const handlePrevDay = () => setDate((d) => subDays(d, 1));
  const handleNextDay = () => setDate((d) => addDays(d, 1));
  const handleToday = () => setDate(new Date());

  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
  const formattedDate = format(date, "EEEE d MMMM yyyy", { locale: getDateFnsLocale() });
  const formattedPrintDate = format(printDate, "EEEE d MMMM yyyy", { locale: getDateFnsLocale() });

  const activePrintSummary = printSummary ?? null;

  // Filter cancelled from the print section based on user preference
  const printReservations = activePrintSummary
    ? showCancelledInPrint
      ? activePrintSummary.reservations
      : activePrintSummary.reservations.filter((r) => r.status !== "geannuleerd")
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Print-only header — hidden on screen, shown when printing */}
      <div className="print-header hidden">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="h-5 w-5" />
          <h1 className="text-2xl font-bold">{t("printTitle")}</h1>
        </div>
        <p className="text-sm capitalize">{formattedPrintDate}</p>
        <hr className="mt-3 mb-0 border-gray-400" />
      </div>

      {/* Print-only content for the selected print date */}
      {printReservations.length > 0 && (
        <div className="print-only hidden">
          {/* Totals */}
          <div className="mb-4">
            <h2 className="text-base font-semibold mb-2">{t("totals")}</h2>
            <div className="grid grid-cols-3 gap-2">
              {activePrintSummary!.totals.map((total) => (
                <div
                  key={total.cateringItemId}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="text-sm font-medium">{total.itemName}</span>
                  <span className="font-bold ml-2">{total.totalQuantity}×</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reservations */}
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">
            {t("withCatering", { count: printReservations.length })}
          </h2>
          <div className="space-y-3">
            {printReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="border-l-4 border-l-gray-800 pl-3 py-1"
                style={{ opacity: reservation.status === "geannuleerd" ? 0.6 : 1 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-40 flex-shrink-0">
                    <div className="font-bold tabular-nums text-sm">
                      {reservation.startTime} – {reservation.endTime}
                    </div>
                    {reservation.roomName && (
                      <div className="text-xs text-gray-600">{reservation.roomName}</div>
                    )}
                    {reservation.buildingName && (
                      <div className="text-xs text-gray-500">{reservation.buildingName}</div>
                    )}
                    {reservation.attendees != null && (
                      <div className="text-xs text-gray-500">{t("persons", { count: reservation.attendees })}</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{reservation.title}</span>
                      <span className="text-xs border rounded px-1">
                        {t(`status.${reservation.status}`, { defaultValue: reservation.status })}
                      </span>
                      {reservation.cateringDeliveredAt && (
                        <span className="text-xs border rounded px-1 border-green-600 text-green-700">
                          {t("delivered")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reservation.items.map((item) => (
                        <span
                          key={item.id}
                          className="text-sm bg-gray-100 rounded px-2 py-0.5"
                        >
                          <strong>{item.quantity}×</strong>{" "}
                          {item.itemName ?? t("itemFallback", { id: item.cateringItemId })}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePrintSummary && printReservations.length === 0 && (
        <div className="print-only hidden">
          <p className="text-sm text-gray-600">
            {t("noOrdersForPrint", { date: formattedPrintDate })}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="print-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-7 w-7 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>

        {/* Date navigator + print controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 border rounded-md bg-card min-w-[200px] justify-center">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium capitalize">{formattedDate}</span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={handleToday}>
              {t("today")}
            </Button>
          )}

          {/* Cancelled toggle */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCancelledInPrint}
              onChange={(e) => setShowCancelledInPrint(e.target.checked)}
              className="rounded border-input"
            />
            {t("printCancelled")}
          </label>

          {/* Print date picker + print button */}
          <div
            className={cn(
              "flex items-center gap-1.5 border rounded-md px-2 py-1 bg-card",
              isPrintError && "border-red-400"
            )}
          >
            <Printer
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isPrintError ? "text-red-400" : "text-muted-foreground"
              )}
            />
            <input
              type="date"
              value={printDateStr}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value
                    .split("-")
                    .map(Number) as [number, number, number];
                  setPrintDate(new Date(y, m - 1, d));
                }
              }}
              className="text-sm bg-transparent border-none outline-none cursor-pointer"
              aria-label={t("printDateLabel")}
              title={t("printDateTitle")}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={isPrintFetching || isPrintError}
            title={
              isPrintError
                ? t("printErrorTitle")
                : isPrintFetching
                ? t("printLoadingTitle")
                : t("printForDate", { date: formattedPrintDate })
            }
          >
            <Printer className="h-4 w-4 mr-1.5" />
            {isPrintFetching ? t("loading") : t("print")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="print-hidden space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !summary || summary.reservations.length === 0 ? (
        <Card className="print-hidden">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UtensilsCrossed className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">{t("emptyTitle")}</h3>
            <p className="text-muted-foreground text-sm">
              {t("emptyDescription", { date: formattedDate })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Dagelijks totaaloverzicht */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-primary" />
                {t("totals")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.totals.map((total) => (
                  <div
                    key={total.cateringItemId}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <span className="text-sm font-medium">{total.itemName}</span>
                    <Badge variant="secondary" className="text-sm font-bold ml-2 flex-shrink-0">
                      {total.totalQuantity}×
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tijdlijn van leveringen */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {t("timeline", { count: summary.reservations.length })}
            </h2>
            <div className="space-y-3">
              {summary.reservations.map((reservation) => {
                const delivered = !!reservation.cateringDeliveredAt;
                return (
                  <Card
                    key={reservation.id}
                    className={cn(
                      "catering-card border-l-4 transition-colors",
                      reservation.status === "geannuleerd"
                        ? "catering-card--cancelled border-l-red-400 opacity-60"
                        : delivered
                        ? "border-l-green-500 bg-green-50/40 dark:bg-green-950/20"
                        : "border-l-primary"
                    )}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        {/* Time + room info */}
                        <div className="flex-shrink-0 sm:w-48">
                          <div
                            className={cn(
                              "flex items-center gap-1.5 text-base font-bold tabular-nums",
                              delivered && "text-green-700 dark:text-green-400"
                            )}
                          >
                            <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className={cn(delivered && "line-through decoration-green-500/60")}>
                              {reservation.startTime} – {reservation.endTime}
                            </span>
                          </div>
                          {reservation.roomName && (
                            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>{reservation.roomName}</span>
                            </div>
                          )}
                          {reservation.buildingName && (
                            <div className="text-xs text-muted-foreground ml-5">
                              {reservation.buildingName}
                            </div>
                          )}
                          {reservation.attendees != null && (
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Users className="h-3.5 w-3.5 flex-shrink-0" />
                              {t("persons", { count: reservation.attendees })}
                            </div>
                          )}
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-auto self-stretch" />

                        {/* Title + status + items */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3
                              className={cn(
                                "font-semibold text-sm leading-tight",
                                delivered && "line-through text-muted-foreground decoration-green-500/60"
                              )}
                            >
                              {reservation.title}
                            </h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs flex-shrink-0",
                                STATUS_COLORS[reservation.status] ?? ""
                              )}
                            >
                              {t(`status.${reservation.status}`, { defaultValue: reservation.status })}
                            </Badge>
                          </div>

                          {/* Catering items */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {reservation.items.map((item) => (
                              <div
                                key={item.id}
                                className={cn(
                                  "flex items-center gap-1.5 text-sm bg-muted rounded-md px-2.5 py-1",
                                  delivered && "opacity-60"
                                )}
                              >
                                <span className="font-semibold text-primary">{item.quantity}×</span>
                                <span>{item.itemName ?? t("itemFallback", { id: item.cateringItemId })}</span>
                              </div>
                            ))}
                          </div>

                          {/* Delivery action — hidden when printing */}
                          {reservation.status !== "geannuleerd" && (
                            <Button
                              variant={delivered ? "secondary" : "outline"}
                              size="sm"
                              disabled={isToggling}
                              onClick={() => toggleDelivered(reservation.id)}
                              className={cn(
                                "print-hidden gap-1.5 text-xs h-7",
                                delivered
                                  ? "text-green-700 border-green-300 bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60"
                                  : ""
                              )}
                            >
                              {delivered ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t("delivered")}
                                </>
                              ) : (
                                <>
                                  <Circle className="h-3.5 w-3.5" />
                                  {t("markDelivered")}
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
