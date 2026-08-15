import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListTicketCategories, 
  useListRooms, 
  useCreateTicket,
  TicketCategory,
  Room
} from "@workspace/api-client-react";
import { Ticket, ArrowLeft, Loader2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const baseSchema = z.object({
  categoryId: z.number({ required_error: "Kies een categorie" }),
  title: z.string().min(3, "Titel moet minimaal 3 karakters bevatten"),
  description: z.string().min(10, "Beschrijving moet minimaal 10 karakters bevatten"),
  roomId: z.number().optional().nullable(),
  formData: z.record(z.any()).optional(),
});

export default function MeldingenNieuwPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: categories, isLoading: isCategoriesLoading } = useListTicketCategories();
  const { data: rooms } = useListRooms();
  const createTicket = useCreateTicket();

  const [selectedCategory, setSelectedCategory] = useState<TicketCategory | null>(null);

  const form = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      title: "",
      description: "",
      formData: {},
    },
  });

  const categoryId = form.watch("categoryId");

  useEffect(() => {
    if (categoryId && categories) {
      const cat = categories.find(c => c.id === categoryId);
      if (cat) {
        setSelectedCategory(cat);
        // Reset dynamic form data when category changes
        form.setValue("formData", {});
      }
    }
  }, [categoryId, categories, form]);

  const onSubmit = (values: z.infer<typeof baseSchema>) => {
    // Validate dynamic fields manually if needed, or just send them
    const payload = {
      ...values,
      categoryId: values.categoryId,
    };

    createTicket.mutate({ data: payload }, {
      onSuccess: (newTicket) => {
        toast({
          title: "Melding aangemaakt",
          description: `Uw melding is geregistreerd met nummer ${newTicket.number}`,
        });
        setLocation(`/meldingen/${newTicket.id}`);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Fout",
          description: "Er is een fout opgetreden bij het aanmaken van de melding.",
        });
      }
    });
  };

  const renderDynamicField = (field: any) => {
    const fieldName = `formData.${field.key}`;

    return (
      <FormField
        key={field.key}
        control={form.control}
        name={fieldName as any}
        render={({ field: formField }) => {
          return (
            <FormItem className={field.type === 'checkbox' ? 'flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm' : ''}>
              {field.type !== 'checkbox' && <FormLabel>{field.label} {field.required && <span className="text-destructive">*</span>}</FormLabel>}
              <FormControl>
                {field.type === 'text' || field.type === 'number' || field.type === 'date' ? (
                  <Input 
                    type={field.type} 
                    placeholder={`Vul ${field.label.toLowerCase()} in`} 
                    {...formField} 
                    value={formField.value || ''}
                  />
                ) : field.type === 'textarea' ? (
                  <Textarea 
                    placeholder={`Vul ${field.label.toLowerCase()} in`} 
                    {...formField} 
                    value={formField.value || ''}
                  />
                ) : field.type === 'select' ? (
                  <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Maak een keuze" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt: string) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === 'checkbox' ? (
                  <Checkbox 
                    checked={formField.value === true}
                    onCheckedChange={formField.onChange}
                  />
                ) : null}
              </FormControl>
              {field.type === 'checkbox' && (
                <div className="space-y-1 leading-none">
                  <FormLabel>{field.label} {field.required && <span className="text-destructive">*</span>}</FormLabel>
                </div>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/meldingen")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nieuwe melding</h1>
          <p className="text-muted-foreground">Registreer een facilitair probleem of verzoek.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Categorisatie</CardTitle>
              <CardDescription>Kies het type melding zodat we deze naar het juiste team kunnen sturen.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categorie</FormLabel>
                    <Select 
                      onValueChange={(v) => field.onChange(parseInt(v))} 
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger disabled={isCategoriesLoading}>
                          <SelectValue placeholder="Selecteer een categorie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedCategory && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg flex gap-4 items-start">
                  <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">Verwachte afhandeling</p>
                    <p className="text-muted-foreground">
                      Uw melding wordt automatisch doorgezet naar: <span className="font-medium capitalize">{selectedCategory.routeToRole.replace('_', ' ')}</span>.
                      Standaard prioriteit: <Badge variant="outline" className="ml-1 scale-90">{selectedCategory.defaultPriority}</Badge>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedCategory && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <Card>
                <CardHeader>
                  <CardTitle>Melding details</CardTitle>
                  <CardDescription>Omschrijf de melding zo duidelijk mogelijk.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titel</FormLabel>
                        <FormControl>
                          <Input placeholder="Korte en duidelijke omschrijving" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Uitgebreide omschrijving</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Beschrijf het probleem of verzoek in detail..." 
                            className="min-h-[120px]"
                            {...field} 
                          />
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
                        <FormLabel>Locatie (Ruimte)</FormLabel>
                        <Select 
                          onValueChange={(v) => field.onChange(parseInt(v))} 
                          value={field.value?.toString() || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Geen specifieke ruimte" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Geen specifieke ruimte</SelectItem>
                            {rooms?.map((room) => (
                              <SelectItem key={room.id} value={room.id.toString()}>
                                {room.name} ({room.code}) - {room.buildingName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Optioneel, als de melding aan een ruimte gekoppeld is.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {selectedCategory.formFields?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Specifieke informatie</CardTitle>
                    <CardDescription>Aanvullende vragen voor deze categorie.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedCategory.formFields.map(renderDynamicField)}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setLocation("/meldingen")}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={createTicket.isPending}>
                  {createTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Melding indienen
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
