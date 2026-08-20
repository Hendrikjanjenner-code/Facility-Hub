import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useListRooms, useGetStructure } from "@workspace/api-client-react";
import { DoorOpen, Search, MapPin, Building, CalendarDays } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function RuimtesPage() {
  const { t } = useTranslation("ruimtes");
  const [location, setLocation] = useLocation();
  
  // Parse URL params
  const searchParams = new URLSearchParams(window.location.search);
  const initialFloorId = searchParams.get('floorId');

  const [search, setSearch] = useState("");
  const [buildingId, setBuildingId] = useState<string>("all");
  const [floorId, setFloorId] = useState<string>(initialFloorId || "all");
  const [bookableOnly, setBookableOnly] = useState(false);

  const { data: rooms, isLoading } = useListRooms({
    floorId: floorId !== "all" ? parseInt(floorId) : undefined,
    buildingId: buildingId !== "all" ? parseInt(buildingId) : undefined,
    bookable: bookableOnly ? true : undefined
  });

  const { data: structure } = useGetStructure();

  const buildings = useMemo(() => {
    return structure?.flatMap(o => o.sites.flatMap(s => s.buildings)) || [];
  }, [structure]);

  const floors = useMemo(() => {
    if (buildingId !== "all") {
      const b = buildings.find(b => b.id.toString() === buildingId);
      return b?.floors || [];
    }
    return buildings.flatMap(b => b.floors);
  }, [buildings, buildingId]);

  const filteredRooms = useMemo(() => {
    if (!rooms) return [];
    if (!search) return rooms;
    return rooms.filter(r => 
      r.name.toLowerCase().includes(search.toLowerCase()) || 
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.functionType.toLowerCase().includes(search.toLowerCase())
    );
  }, [rooms, search]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t("searchPlaceholder")} 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
          <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setFloorId("all"); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("allBuildings")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allBuildings")}</SelectItem>
              {buildings.map(b => (
                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={floorId} onValueChange={setFloorId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("allFloors")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allFloors")}</SelectItem>
              {floors.map(f => (
                <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2 px-2">
            <Checkbox 
              id="bookable" 
              checked={bookableOnly}
              onCheckedChange={(c) => setBookableOnly(c === true)}
            />
            <Label htmlFor="bookable" className="cursor-pointer">{t("bookable")}</Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !filteredRooms?.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
          <DoorOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("empty.title")}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            {t("empty.description")}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredRooms.map((room) => (
            <Card 
              key={room.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors group overflow-hidden"
              onClick={() => setLocation(`/ruimtes/${room.id}`)}
            >
              <div className="flex flex-col sm:flex-row p-4 gap-4 sm:items-center">
                <div className="flex flex-col gap-1 w-[120px] flex-shrink-0">
                  <span className="font-mono text-sm font-semibold text-primary">{room.code}</span>
                  <Badge variant="outline" className="w-fit font-normal capitalize">
                    {room.functionType}
                  </Badge>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate group-hover:text-primary transition-colors mb-1">
                    {room.name}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground truncate">
                    <span className="flex items-center gap-1">
                      <Building className="h-3.5 w-3.5" />
                      {room.buildingName} - {room.floorName}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {t("areaM2", { area: room.areaM2 })}
                    </span>
                    {room.capacity && (
                      <span className="flex items-center gap-1">
                        <DoorOpen className="h-3.5 w-3.5" />
                        {t("persons", { count: room.capacity })}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-3 flex-shrink-0 ml-auto w-full sm:w-auto">
                  {room.bookable && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300">
                      <CalendarDays className="mr-1 h-3 w-3" /> {t("bookable")}
                    </Badge>
                  )}
                  <div className="flex gap-2 text-xs">
                    {(room.openTicketCount || 0) > 0 && (
                      <span className="text-destructive font-medium">{t("openTickets", { count: room.openTicketCount })}</span>
                    )}
                    {(room.assetCount || 0) > 0 && (
                      <span className="text-muted-foreground">{t("assetCount", { count: room.assetCount })}</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
