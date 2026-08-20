import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { 
  useListRooms, 
  useListCateringItems, 
  useCreateReservation,
  useGetCurrentUser
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { Loader2, Plus, Trash2, CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const schema = z.object({
  title: z.string().min(3),
  roomId: z.number(),
  date: z.date(),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  attendees: z.number().min(1).optional().nullable(),
  setupBufferMin: z.number().min(0).default(0),
  cleanupBufferMin: z.number().min(0).default(0),
  cateringOrders: z.array(z.object({
    cateringItemId: z.number(),
    quantity: z.number().min(1)
  })).optional()
});

type FormValues = z.infer<typeof schema>;

export function NewReservationDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation("reserveringen");
  const validatedSchema = z.object({
    title: z.string().min(3, t("new.validation.titleMin")),
    roomId: z.number({ required_error: t("new.validation.roomRequired") }),
    date: z.date({ required_error: t("new.validation.dateRequired") }),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, t("new.validation.timeFormat")),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, t("new.validation.timeFormat")),
    attendees: z.number().min(1).optional().nullable(),
    setupBufferMin: z.number().min(0).default(0),
    cleanupBufferMin: z.number().min(0).default(0),
    cateringOrders: z.array(z.object({
      cateringItemId: z.number(),
      quantity: z.number().min(1)
    })).optional()
  }).refine(data => {
    const start = parseInt(data.startTime.replace(':', ''));
    const end = parseInt(data.endTime.replace(':', ''));
    return end > start;
  }, { message: t("new.validation.endAfterStart"), path: ["endTime"] });
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: user } = useGetCurrentUser();
  const { data: rooms, isLoading: isRoomsLoading } = useListRooms({ bookable: true });
  const { data: cateringItems } = useListCateringItems();
  const createReservation = useCreateReservation();

  const form = useForm<FormValues>({
    resolver: zodResolver(validatedSchema),
    defaultValues: {
      title: "",
      startTime: "09:00",
      endTime: "10:00",
      setupBufferMin: 0,
      cleanupBufferMin: 0,
      cateringOrders: []
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      kind: "room",
      title: values.title,
      roomId: values.roomId,
      date: format(values.date, "yyyy-MM-dd"),
      startTime: values.startTime,
      endTime: values.endTime,
      attendees: values.attendees || null,
      setupBufferMin: values.setupBufferMin,
      cleanupBufferMin: values.cleanupBufferMin,
      cateringOrders: values.cateringOrders?.length ? values.cateringOrders : undefined
    };

    createReservation.mutate({ data: payload }, {
      onSuccess: (res) => {
        toast({ title: t("new.toastCreated") });
        onOpenChange(false);
        setLocation(`/reserveringen/${res.id}`);
      },
      onError: (err: any) => {
        if (err?.status === 409) {
          toast({ 
            variant: "destructive", 
            title: t("new.toastConflictTitle"), 
            description: t("new.toastConflictDesc") 
          });
        } else {
          toast({ 
            variant: "destructive", 
            title: t("new.toastErrorTitle"), 
            description: t("new.toastErrorDesc") 
          });
        }
      }
    });
  };

  const cateringOrders = form.watch("cateringOrders") || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new.title")}</DialogTitle>
          <DialogDescription>
            {t("new.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("new.meetingTitle")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("new.meetingTitlePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("new.room")}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                      <FormControl>
                        <SelectTrigger disabled={isRoomsLoading}>
                          <SelectValue placeholder={t("new.roomPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rooms?.map((r) => (
                          <SelectItem key={r.id} value={r.id.toString()}>
                            {t("new.roomOption", { name: r.name, capacity: r.capacity })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col pt-2">
                    <FormLabel>{t("new.date")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "d MMMM yyyy", { locale: getDateFnsLocale() })
                            ) : (
                              <span>{t("new.datePlaceholder")}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0,0,0,0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("new.startTime")}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("new.endTime")}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="attendees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("new.attendees")}</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} onChange={e => field.onChange(parseInt(e.target.value))} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4 sm:col-span-2">
                <FormField
                  control={form.control}
                  name="setupBufferMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("new.setupBuffer")}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={15} {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cleanupBufferMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("new.cleanupBuffer")}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={15} {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">{t("new.cateringOptional")}</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const current = form.getValues("cateringOrders") || [];
                    form.setValue("cateringOrders", [...current, { cateringItemId: 0, quantity: 1 }]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> {t("new.add")}
                </Button>
              </div>

              {cateringOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t("new.noCatering")}</p>
              ) : (
                <div className="space-y-3">
                  {cateringOrders.map((order, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Select 
                          value={order.cateringItemId ? order.cateringItemId.toString() : ""} 
                          onValueChange={(v) => {
                            const newOrders = [...cateringOrders];
                            newOrders[index].cateringItemId = parseInt(v);
                            form.setValue("cateringOrders", newOrders);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("new.chooseItem")} />
                          </SelectTrigger>
                          <SelectContent>
                            {cateringItems?.map(item => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.name} (€{item.price.toFixed(2)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24">
                        <Input 
                          type="number" 
                          min={1} 
                          value={order.quantity} 
                          onChange={(e) => {
                            const newOrders = [...cateringOrders];
                            newOrders[index].quantity = parseInt(e.target.value) || 1;
                            form.setValue("cateringOrders", newOrders);
                          }}
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          const newOrders = [...cateringOrders];
                          newOrders.splice(index, 1);
                          form.setValue("cateringOrders", newOrders);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel", { ns: "common" })}</Button>
              <Button type="submit" disabled={createReservation.isPending}>
                {createReservation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("new.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
