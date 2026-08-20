import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { 
  useListVisitors, 
  useUpdateVisitor,
  useCreateVisitor,
  useListUsers,
  getListUsersQueryKey,
  useGetCurrentUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Plus, 
  Search, 
  CheckCircle2, 
  LogOut, 
  Clock,
  QrCode,
  Building2,
  Mail,
  User as UserIcon,
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { getVisitorStatusColor } from "@/lib/status-helpers";

const makeSchema = (t: (k: string) => string) => z.object({
  name: z.string().min(2, t("validation.nameRequired")),
  company: z.string().optional(),
  email: z.string().email(t("validation.emailInvalid")).optional().or(z.literal("")),
  hostId: z.number().optional(),
  expectedArrival: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, t("validation.timeInvalid")),
});

type BezoekerFormValues = {
  name: string;
  company?: string;
  email?: string;
  hostId?: number;
  expectedArrival: string;
};

// Alleen deze rollen mogen een andere host kiezen (en de medewerkerslijst opvragen)
const HOST_PICKER_ROLES = ["receptie", "facilitair_manager", "beheerder"];

export default function BezoekersPage() {
  const { t } = useTranslation("bezoekers");
  const schema = makeSchema(t);
  const { data: user } = useGetCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const canPickHost = !!user && HOST_PICKER_ROLES.includes(user.role);
  const { data: visitors, isLoading } = useListVisitors({ date: todayStr });
  const { data: users, isLoading: isUsersLoading } = useListUsers({
    query: { enabled: canPickHost, queryKey: getListUsersQueryKey() },
  });
  
  const updateVisitor = useUpdateVisitor();
  const createVisitor = useCreateVisitor();

  const form = useForm<BezoekerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      expectedArrival: "09:00",
    },
  });

  const onSubmit = (values: BezoekerFormValues) => {
    createVisitor.mutate({ 
      data: {
        ...values,
        visitDate: todayStr,
      } 
    }, {
      onSuccess: () => {
        toast({ title: t("toast.registered") });
        setIsNewDialogOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
    });
  };

  const handleStatusChange = (id: number, status: string) => {
    updateVisitor.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: t("toast.statusChanged", { status: t(`status.${status}`, status) }) });
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      }
    });
  };

  const filteredVisitors = visitors?.filter(v => 
    v.name.toLowerCase().includes(search.toLowerCase()) || 
    (v.company && v.company.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle", { date: format(new Date(), "d MMMM yyyy", { locale: getDateFnsLocale() }) })}</p>
        </div>
        
        <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("register")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("dialog.description")}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("dialog.name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("dialog.namePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("dialog.company")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("dialog.companyPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("dialog.email")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t("dialog.emailPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {canPickHost ? (
                    <FormField
                      control={form.control}
                      name="hostId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.host")}</FormLabel>
                          <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                            <FormControl>
                              <SelectTrigger disabled={isUsersLoading}>
                                <SelectValue placeholder={t("dialog.hostPlaceholder")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users?.map((u) => (
                                <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormItem>
                      <FormLabel>{t("dialog.host")}</FormLabel>
                      <Input value={user?.name ?? ""} disabled />
                    </FormItem>
                  )}
                  <FormField
                    control={form.control}
                    name="expectedArrival"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("dialog.expectedArrival")}</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsNewDialogOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                  <Button type="submit" disabled={createVisitor.isPending}>
                    {createVisitor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("dialog.submit")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card p-4 rounded-lg border shadow-sm w-full max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t("searchPlaceholder")} 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)
        ) : !filteredVisitors?.length ? (
          <div className="col-span-full p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          filteredVisitors.map((visitor) => (
            <Card key={visitor.id} className="overflow-hidden flex flex-col">
              {/* Badge visual */}
              <div className="bg-muted border-b p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 bg-white rounded-md border shadow-sm flex items-center justify-center font-mono font-bold text-xs">
                    {visitor.badgeCode}
                  </div>
                  <div>
                    <h3 className="font-semibold leading-tight">{visitor.name}</h3>
                    {visitor.company && <p className="text-xs text-muted-foreground leading-tight">{visitor.company}</p>}
                  </div>
                </div>
                <Badge variant="secondary" className={getVisitorStatusColor(visitor.status)}>
                  {t(`status.${visitor.status}`, visitor.status)}
                </Badge>
              </div>
              
              <CardContent className="p-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{t("expected", { time: visitor.expectedArrival })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{t("hostLabel")}<span className="font-medium">{visitor.hostName}</span></span>
                  </div>
                  
                  {visitor.status !== 'verwacht' && (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md mt-2 space-y-1">
                      {visitor.checkedInAt && <div>{t("checkedIn", { time: format(new Date(visitor.checkedInAt), "HH:mm") })}</div>}
                      {visitor.checkedOutAt && <div>{t("checkedOut", { time: format(new Date(visitor.checkedOutAt), "HH:mm") })}</div>}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-auto">
                  {visitor.status === 'verwacht' && (
                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700" 
                      onClick={() => handleStatusChange(visitor.id, 'aanwezig')}
                      disabled={updateVisitor.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> {t("checkIn")}
                    </Button>
                  )}
                  {visitor.status === 'aanwezig' && (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => handleStatusChange(visitor.id, 'vertrokken')}
                      disabled={updateVisitor.isPending}
                    >
                      <LogOut className="mr-2 h-4 w-4" /> {t("checkOut")}
                    </Button>
                  )}
                  {visitor.status === 'vertrokken' && (
                    <Button variant="secondary" className="w-full" disabled>
                      {t("visitDone")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
