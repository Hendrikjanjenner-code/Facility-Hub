import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { nl } from "date-fns/locale";
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

const STATUS_LABELS: Record<string, string> = {
  bevestigd: "Bevestigd",
  ingecheckt: "Ingecheckt",
  uitgecheckt: "Uitgecheckt",
  geannuleerd: "Geannuleerd",
};

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

export default function CateringPage() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["catering-daily-summary", dateStr],
    queryFn: async () => {
      const res = await fetch(`/api/catering/daily-summary?date=${dateStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ophalen mislukt");
      return res.json() as Promise<DailySummary>;
    },
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
  const formattedDate = format(date, "EEEE d MMMM yyyy", { locale: nl });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Print-only header — hidden on screen, shown when printing */}
      <div className="print-header hidden">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Catering — daglijst</h1>
        </div>
        <p className="text-sm capitalize">{formattedDate}</p>
        <hr className="mt-3 mb-0 border-gray-400" />
      </div>

      {/* Header */}
      <div className="print-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-7 w-7 text-primary" />
            Catering
          </h1>
          <p className="text-muted-foreground mt-1">
            Dagelijks bestellingsoverzicht voor de cateraar
          </p>
        </div>

        {/* Date navigator + print button */}
        <div className="flex items-center gap-2">
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
              Vandaag
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            title="Afdrukken"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Afdrukken
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
            <h3 className="text-lg font-semibold mb-1">Geen cateringbestellingen</h3>
            <p className="text-muted-foreground text-sm">
              Er zijn geen cateringbestellingen voor{" "}
              <span className="font-medium">{formattedDate}</span>.
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
                Totalen voor de dag
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
              Tijdlijn — {summary.reservations.length} reservering
              {summary.reservations.length !== 1 ? "en" : ""} met catering
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
                        ? "border-l-red-400 opacity-60"
                        : delivered
                        ? "border-l-green-500 bg-green-50/40 dark:bg-green-950/20"
                        : "border-l-primary"
                    )}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        {/* Time + room info */}
                        <div className="flex-shrink-0 sm:w-48">
                          <div className={cn(
                            "flex items-center gap-1.5 text-base font-bold tabular-nums",
                            delivered && "text-green-700 dark:text-green-400"
                          )}>
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
                              {reservation.attendees} personen
                            </div>
                          )}
                        </div>

                        <Separator orientation="vertical" className="hidden sm:block h-auto self-stretch" />

                        {/* Title + status + items */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className={cn(
                              "font-semibold text-sm leading-tight",
                              delivered && "line-through text-muted-foreground decoration-green-500/60"
                            )}>
                              {reservation.title}
                            </h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs flex-shrink-0",
                                STATUS_COLORS[reservation.status] ?? ""
                              )}
                            >
                              {STATUS_LABELS[reservation.status] ?? reservation.status}
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
                                <span>{item.itemName ?? `Item ${item.cateringItemId}`}</span>
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
                                  Geleverd
                                </>
                              ) : (
                                <>
                                  <Circle className="h-3.5 w-3.5" />
                                  Markeer als geleverd
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
