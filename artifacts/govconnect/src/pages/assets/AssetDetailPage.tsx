import { useLocation } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { 
  useGetAsset, 
  useListTickets,
  getGetAssetQueryKey
} from "@workspace/api-client-react";
import { 
  ArrowLeft, 
  MapPin, 
  PcCase, 
  Ticket, 
  Info,
  Calendar,
  Fingerprint,
  Tag,
  Wrench
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getTicketStatusColor, cn } from "@/lib/status-helpers";

function getAssetStatusColor(status: string) {
  switch(status) {
    case 'in_gebruik': return 'bg-green-100 text-green-800';
    case 'in_onderhoud': return 'bg-amber-100 text-amber-800';
    case 'defect': return 'bg-red-100 text-red-800';
    case 'afgeschreven': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function AssetDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("assets");
  const assetId = parseInt(id);
  const [, setLocation] = useLocation();

  const { data: asset, isLoading } = useGetAsset(assetId, { query: { enabled: !!assetId, queryKey: getGetAssetQueryKey(assetId) } });
  
  // List tickets related to this asset
  // Since useListTickets doesn't have an assetId filter, we could use search, but we just use search for code for now or assume backend implements it
  const { data: tickets } = useListTickets({ search: asset?.code });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!asset) {
    return <div>{t("detail.notFound")}</div>;
  }

  const assetTickets = tickets?.filter(t => t.assetName === asset.name || t.description.includes(asset.code)) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/assets")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
            <Badge variant="secondary" className={cn("capitalize border-transparent", getAssetStatusColor(asset.status))}>
              {t(`status.${asset.status}`, asset.status.replace('_', ' '))}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <PcCase className="h-3.5 w-3.5" />
            {asset.category} {asset.brand ? `• ${asset.brand}` : ''}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" /> {t("detail.info.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-6 text-sm">
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Fingerprint className="h-4 w-4" /> {t("detail.info.code")}
                  </dt>
                  <dd className="font-mono font-semibold">{asset.code}</dd>
                </div>
                
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Tag className="h-4 w-4" /> {t("detail.info.category")}
                  </dt>
                  <dd className="font-medium">{asset.category}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <PcCase className="h-4 w-4" /> {t("detail.info.brandModel")}
                  </dt>
                  <dd className="font-medium">{asset.brand || '-'} {asset.model || ''}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Fingerprint className="h-4 w-4" /> {t("detail.info.serialNumber")}
                  </dt>
                  <dd className="font-mono">{asset.serialNumber || '-'}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {t("detail.info.location")}
                  </dt>
                  <dd className="font-medium">
                    {asset.roomId ? (
                      <Button variant="link" className="p-0 h-auto font-medium" onClick={() => setLocation(`/ruimtes/${asset.roomId}`)}>
                        {asset.roomName} ({asset.buildingName})
                      </Button>
                    ) : (
                      <span className="italic text-muted-foreground">{t("detail.info.notAssigned")}</span>
                    )}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" /> {t("detail.info.purchaseDate")}
                  </dt>
                  <dd className="font-medium">
                    {asset.purchaseDate ? format(new Date(asset.purchaseDate), "d MMMM yyyy", { locale: getDateFnsLocale() }) : '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" /> {t("detail.tickets.title")}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setLocation(`/meldingen/nieuw?assetId=${asset.id}`)}>
                <Wrench className="h-4 w-4 mr-2" /> {t("detail.tickets.newTicket")}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="divide-y border rounded-lg">
                {!assetTickets?.length ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">{t("detail.tickets.empty")}</div>
                ) : (
                  assetTickets.map(ticket => (
                    <div key={ticket.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setLocation(`/meldingen/${ticket.id}`)}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-primary">{ticket.number}</span>
                          <span className="font-medium text-sm truncate">{ticket.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(ticket.createdAt), "d MMMM yyyy", { locale: getDateFnsLocale() })} • {ticket.categoryName}
                        </div>
                      </div>
                      <Badge variant="secondary" className={getTicketStatusColor(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("detail.actions.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline" onClick={() => setLocation(`/meldingen/nieuw`)}>
                <Wrench className="mr-2 h-4 w-4" /> {t("detail.actions.reportFault")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
