import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListTicketCategories, 
  useListRooms, 
  useCreateTicket,
  useSuggestKnowledgeArticles,
  getSuggestKnowledgeArticlesQueryKey,
  TicketCategory,
  Room,
  KnowledgeArticle
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Ticket, ArrowLeft, Loader2, Info, BookOpen, ChevronDown, ChevronUp } from "lucide-react";

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

export default function MeldingenNieuwPage() {
  const { t } = useTranslation("meldingen");
  const baseSchema = z.object({
    categoryId: z.number({ required_error: t("new.validation.categoryRequired") }),
    title: z.string().min(3, t("new.validation.titleMin")),
    description: z.string().min(10, t("new.validation.descriptionMin")),
    roomId: z.number().optional().nullable(),
    formData: z.record(z.any()).optional(),
  });
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: categories, isLoading: isCategoriesLoading } = useListTicketCategories();
  const { data: rooms } = useListRooms();
  const createTicket = useCreateTicket();

  const [selectedCategory, setSelectedCategory] = useState<TicketCategory | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);

  // Text-based suggestions (while typing)
  const { data: textSuggestions } = useSuggestKnowledgeArticles(
    { q: suggestionQuery },
    { query: { enabled: suggestionQuery.length >= 3, staleTime: 10_000, queryKey: getSuggestKnowledgeArticlesQueryKey({ q: suggestionQuery }) } },
  );

  // Category-based suggestions (immediately on category select)
  const { data: categorySuggestions } = useSuggestKnowledgeArticles(
    { ticketCategoryId: selectedCategory?.id },
    { query: { enabled: !!selectedCategory, staleTime: 60_000, queryKey: getSuggestKnowledgeArticlesQueryKey({ ticketCategoryId: selectedCategory?.id }) } },
  );

  // Merge: category-linked first, then text-based, deduplicated, max 5
  const suggestions = (() => {
    const seen = new Set<number>();
    const merged: KnowledgeArticle[] = [];
    for (const a of [...(categorySuggestions ?? []), ...(textSuggestions ?? [])]) {
      if (!seen.has(a.id) && merged.length < 5) {
        seen.add(a.id);
        merged.push(a);
      }
    }
    return merged;
  })();

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
          title: t("new.toastCreatedTitle"),
          description: t("new.toastCreatedDesc", { number: newTicket.number }),
        });
        setLocation(`/meldingen/${newTicket.id}`);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: t("new.toastErrorTitle"),
          description: t("new.toastErrorDesc"),
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
                    placeholder={t("new.fieldPlaceholder", { label: field.label.toLowerCase() })} 
                    {...formField} 
                    value={formField.value || ''}
                  />
                ) : field.type === 'textarea' ? (
                  <Textarea 
                    placeholder={t("new.fieldPlaceholder", { label: field.label.toLowerCase() })} 
                    {...formField} 
                    value={formField.value || ''}
                  />
                ) : field.type === 'select' ? (
                  <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("new.makeChoice")} />
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
          <h1 className="text-3xl font-bold tracking-tight">{t("new.title")}</h1>
          <p className="text-muted-foreground">{t("new.subtitle")}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("new.categorisation")}</CardTitle>
              <CardDescription>{t("new.categorisationDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("new.category")}</FormLabel>
                    <Select 
                      onValueChange={(v) => field.onChange(parseInt(v))} 
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger disabled={isCategoriesLoading}>
                          <SelectValue placeholder={t("new.categoryPlaceholder")} />
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
                    <p className="font-medium text-foreground">{t("new.expectedHandling")}</p>
                    <p className="text-muted-foreground">
                      {t("new.routedTo")}<span className="font-medium capitalize">{selectedCategory.routeToRole.replace('_', ' ')}</span>.
                      {" "}{t("new.defaultPriority")}<Badge variant="outline" className="ml-1 scale-90">{selectedCategory.defaultPriority}</Badge>
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
                  <CardTitle>{t("new.detailsTitle")}</CardTitle>
                  <CardDescription>{t("new.detailsDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("new.titleLabel")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("new.titlePlaceholder")}
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              setSuggestionQuery(e.target.value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Knowledge base suggestions */}
                  {suggestions && suggestions.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span>{t("new.suggestionsTitle")}</span>
                      </div>
                      <div className="space-y-2">
                        {suggestions.map((s: KnowledgeArticle) => (
                          <div key={s.id} className="rounded-md border bg-background p-2.5">
                            <button
                              type="button"
                              className="w-full flex items-center justify-between text-left gap-2"
                              onClick={() => setExpandedSuggestion(expandedSuggestion === s.id ? null : s.id)}
                            >
                              <span className="text-sm font-medium">{s.title}</span>
                              {expandedSuggestion === s.id ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              )}
                            </button>
                            {expandedSuggestion === s.id && (
                              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed border-t pt-1.5 whitespace-pre-wrap">
                                {s.body}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("new.suggestionsHint")}
                      </p>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("new.descriptionLabel")}</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder={t("new.descriptionPlaceholder")} 
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
                        <FormLabel>{t("new.roomLabel")}</FormLabel>
                        <Select 
                          onValueChange={(v) => field.onChange(parseInt(v))} 
                          value={field.value?.toString() || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("new.roomPlaceholder")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t("new.roomPlaceholder")}</SelectItem>
                            {rooms?.map((room) => (
                              <SelectItem key={room.id} value={room.id.toString()}>
                                {room.name} ({room.code}) - {room.buildingName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>{t("new.roomDescription")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {selectedCategory.formFields?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("new.specificInfoTitle")}</CardTitle>
                    <CardDescription>{t("new.specificInfoDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedCategory.formFields.map(renderDynamicField)}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setLocation("/meldingen")}>
                  {t("common.cancel", { ns: "common" })}
                </Button>
                <Button type="submit" disabled={createTicket.isPending}>
                  {createTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("new.submit")}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
