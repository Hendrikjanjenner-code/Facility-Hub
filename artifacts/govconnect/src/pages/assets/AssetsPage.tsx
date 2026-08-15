import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListAssets, 
  useCreateAsset,
  useGetCurrentUser,
  useListRooms
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PcCase, Search, Plus, MapPin, Loader2, Tag, Fingerprint } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ASSET_STATUSES = ['in_gebruik', 'in_onderhoud', 'defect', 'afgeschreven'];

const schema = z.object({
  name: z.string().min(2, "Naam is verplicht"),
  code: z.string().min(2, "Code is verplicht"),
  category: z.string().min(2, "Categorie is verplicht"),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  roomId: z.number().optional().nullable(),
  status: z.string().default("in_gebruik"),
  purchaseDate: z.string().optional(),
});

function getAssetStatusColor(status: string) {
  switch(status) {
    case 'in_gebruik': return 'bg-green-100 text-green-800';
    case 'in_onderhoud': return 'bg-amber-100 text-amber-800';
    case 'defect': return 'bg-red-100 text-red-800';
    case 'afgeschreven': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function AssetsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  const { data: assets, isLoading } = useListAssets({
    search: search || undefined,
    category: category !== "all" ? category : undefined
  });
  
  const { data: rooms } = useListRooms();
  const createAsset = useCreateAsset();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      code: "",
      category: "",
      status: "in_gebruik",
    },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    createAsset.mutate({ data: values as any }, {
      onSuccess: () => {
        toast({ title: "Asset toegevoegd" });
        setIsNewDialogOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      }
    });
  };

  const categories = Array.from(new Set(assets?.map(a => a.category) || []));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
          <p className="text-muted-foreground">Beheer apparatuur, meubilair en inventaris.</p>
        </div>
        
        {(user?.role === 'beheerder' || user?.role === 'facilitair_manager') && (
          <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Asset toevoegen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nieuw asset registreren</DialogTitle>
                <DialogDescription>
                  Voeg een nieuw object toe aan het vastgoedregister.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Naam</FormLabel>
                          <FormControl>
                            <Input placeholder="Bijv. Bureaustoel Ergonomic" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Code</FormLabel>
                          <FormControl>
                            <Input placeholder="Bijv. INV-2026-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categorie</FormLabel>
                          <FormControl>
                            <Input placeholder="Bijv. Meubilair" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Kies status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ASSET_STATUSES.map(s => (
                                <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="brand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merk (Optioneel)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model (Optioneel)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Serienummer (Optioneel)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="roomId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Locatie (Optioneel)</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Kies ruimte" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {rooms?.map(r => (
                              <SelectItem key={r.id} value={r.id.toString()}>{r.name} ({r.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="pt-4">
                    <Button type="button" variant="ghost" onClick={() => setIsNewDialogOpen(false)}>Annuleren</Button>
                    <Button type="submit" disabled={createAsset.isPending}>
                      {createAsset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Toevoegen
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoeken op naam of code..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Alle categorieën" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      ) : !assets?.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
          <PcCase className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Geen assets gevonden</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Probeer een andere zoekterm of pas de filters aan.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Card 
              key={asset.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors group overflow-hidden flex flex-col"
              onClick={() => setLocation(`/assets/${asset.id}`)}
            >
              <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-1">
                    <h3 className="font-semibold leading-tight group-hover:text-primary transition-colors">{asset.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                      <Fingerprint className="h-3 w-3" />
                      {asset.code}
                    </div>
                  </div>
                  <Badge variant="secondary" className={cn("capitalize border-transparent font-medium whitespace-nowrap ml-2", getAssetStatusColor(asset.status))}>
                    {asset.status.replace('_', ' ')}
                  </Badge>
                </div>
                
                <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    <span>{asset.category} {asset.brand ? `• ${asset.brand}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">
                      {asset.roomName ? `${asset.roomName} (${asset.buildingName})` : <span className="italic">Niet toegewezen</span>}
                    </span>
                  </div>
                </div>
              </div>
              {asset.openTicketCount && asset.openTicketCount > 0 ? (
                <div className="bg-destructive/5 px-4 py-2 border-t border-destructive/10 text-xs text-destructive font-medium flex items-center">
                  <span className="h-2 w-2 rounded-full bg-destructive mr-2 animate-pulse" />
                  {asset.openTicketCount} open {asset.openTicketCount === 1 ? 'melding' : 'meldingen'}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
