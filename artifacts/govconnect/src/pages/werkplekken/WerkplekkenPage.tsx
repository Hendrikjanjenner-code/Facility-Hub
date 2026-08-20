import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { 
  useListWorkplaces, 
  useGetStructure,
  useCreateReservation,
  useGetCurrentUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor, Calendar as CalendarIcon, CheckCircle2, Building2, MapPin, Search, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function WerkplekkenPage() {
  const { t } = useTranslation("werkplekken");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [date, setDate] = useState<Date>(new Date());
  const [floorId, setFloorId] = useState<number | undefined>();
  const [colleagueSearch, setColleagueSearch] = useState("");

  const dateStr = format(date, "yyyy-MM-dd");
  const { data: structure, isLoading: isStructureLoading } = useGetStructure();
  const { data: workplaces, isLoading: isWorkplacesLoading } = useListWorkplaces({ 
    date: dateStr, 
    floorId 
  });
  
  const createReservation = useCreateReservation();

  // Extract all floors for the filter
  const allFloors = structure?.flatMap(o =>
    o.sites.flatMap(s => s.buildings.flatMap(b => b.floors))
  ) || [];

  const handleBookWorkplace = (workplaceId: number, workplaceName: string) => {
    createReservation.mutate({
      data: {
        kind: "workplace",
        title: t("workplaceTitle", { name: workplaceName }),
        workplaceId,
        date: dateStr,
        startTime: "08:00",
        endTime: "17:00",
      }
    }, {
      onSuccess: () => {
        toast({ title: t("toastBookedTitle"), description: t("toastBookedDesc", { date: format(date, "d MMMM yyyy", { locale: getDateFnsLocale() }) }) });
        queryClient.invalidateQueries({ queryKey: ["/api/workplaces"] });
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          toast({ variant: "destructive", title: t("toastConflictTitle"), description: t("toastConflictDesc") });
        } else {
          toast({ variant: "destructive", title: t("toastErrorTitle"), description: t("toastErrorDesc") });
        }
      }
    });
  };

  const zones = Array.from(new Set(workplaces?.map(w => w.zone) || []));

  // Colleague search: find workplaces where bookedByName matches the search
  const collegaResults = colleagueSearch.trim().length >= 2
    ? workplaces?.filter(w => w.bookedByName && w.bookedByName.toLowerCase().includes(colleagueSearch.toLowerCase()))
    : undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Collega zoeken */}
      <div className="flex items-center gap-3 bg-card p-4 rounded-lg border shadow-sm">
        <UserCheck className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("colleagueSearchPlaceholder")}
            value={colleagueSearch}
            onChange={(e) => setColleagueSearch(e.target.value)}
          />
        </div>
        {collegaResults !== undefined && (
          <span className="text-sm text-muted-foreground">
            {collegaResults.length === 0
              ? t("noColleagueFound")
              : t("colleagueFound", { count: collegaResults.length })}
          </span>
        )}
      </div>

      {/* Colleague search results */}
      {collegaResults !== undefined && collegaResults.length > 0 && (
        <div className="space-y-2">
          {collegaResults.map(wp => (
            <div key={wp.id} className="flex items-center gap-4 bg-card border rounded-lg p-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {wp.bookedByName?.charAt(0) ?? "?"}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium">{wp.bookedByName}</p>
                <p className="text-xs text-muted-foreground">
                  {wp.name} · {wp.floorName} · {wp.zone}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("bookedIn")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex-1 max-w-[280px]">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "EEEE d MMMM", { locale: getDateFnsLocale() }) : <span>{t("chooseDate")}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 max-w-[280px]">
          <Select value={floorId?.toString() || "all"} onValueChange={(v) => setFloorId(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger disabled={isStructureLoading}>
              <SelectValue placeholder={t("allFloors")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allFloors")}</SelectItem>
              {allFloors.map(f => (
                <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isWorkplacesLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !workplaces?.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
          <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("emptyDesc")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {zones.map(zone => {
            const zoneWorkplaces = workplaces.filter(w => w.zone === zone);
            
            return (
              <div key={zone} className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold capitalize">{zone}</h2>
                  <Badge variant="secondary" className="ml-2">{t("available", { count: zoneWorkplaces.filter(w => w.available).length })}</Badge>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {zoneWorkplaces.map(wp => (
                    <Card 
                      key={wp.id} 
                      className={cn(
                        "overflow-hidden transition-all",
                        wp.available 
                          ? "hover:border-primary/50 cursor-pointer" 
                          : "opacity-60 bg-muted/50 grayscale-[0.5]"
                      )}
                      onClick={() => wp.available && handleBookWorkplace(wp.id, wp.name)}
                    >
                      <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full gap-3 relative">
                        <Monitor className={cn("h-8 w-8", wp.available ? "text-primary" : "text-muted-foreground")} />
                        
                        <div>
                          <div className="font-bold">{wp.name}</div>
                          <div className="text-xs text-muted-foreground">{wp.floorName}</div>
                        </div>

                        {wp.features?.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1 mt-1">
                            {wp.features.map(f => (
                              <span key={f} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{f}</span>
                            ))}
                          </div>
                        )}

                        {!wp.available && wp.bookedByName && (
                          <div className="absolute inset-0 bg-background/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-2">
                            <span className="text-xs font-medium text-foreground">{t("bookedBy")}</span>
                            <span className="text-xs text-muted-foreground text-center truncate w-full px-2">{wp.bookedByName}</span>
                          </div>
                        )}
                        
                        {wp.available && (
                          <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-green-500" />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
