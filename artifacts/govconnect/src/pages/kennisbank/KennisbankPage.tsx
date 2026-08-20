import { useState } from "react";
import { useListKnowledgeArticles, useCreateKnowledgeArticle, useUpdateKnowledgeArticle, useDeleteKnowledgeArticle, useGetCurrentUser, useListTicketCategories, getListKnowledgeArticlesQueryKey, KnowledgeArticle, TicketCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation, Trans } from "react-i18next";
import { BookOpen, Search, Plus, Tag, ChevronDown, ChevronUp, Loader2, Pencil, Bell, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const CATEGORIES = ["algemeen", "klimaat", "schoonmaak", "technisch", "sanitair", "veiligheid", "reserveringen", "catering"];

function ArticleCard({
  article,
  canEdit,
  onEdit,
  onDelete,
  ticketCategories,
}: {
  article: KnowledgeArticle;
  canEdit: boolean;
  onEdit: (article: KnowledgeArticle) => void;
  onDelete: (article: KnowledgeArticle) => void;
  ticketCategories: TicketCategory[];
}) {
  const { t } = useTranslation("kennisbank");
  const [expanded, setExpanded] = useState(false);

  const linkedCategories = ticketCategories.filter((tc) =>
    article.ticketCategoryIds.includes(tc.id),
  );

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm",
        expanded && "border-primary/30 shadow-sm",
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-snug">{article.title}</CardTitle>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant="secondary" className="capitalize text-[11px] h-4 px-1.5">
                {t(`categories.${article.category}`, { defaultValue: article.category })}
              </Badge>
              {article.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {linkedCategories.length > 0 ? (
                <>
                  <Bell className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  {linkedCategories.map((tc) => (
                    <Badge
                      key={tc.id}
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950"
                    >
                      {tc.name}
                    </Badge>
                  ))}
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 italic">
                  {t("noLinkedCategories")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); onEdit(article); }}
                  title={t("edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => { e.stopPropagation(); onDelete(article); }}
                  title={t("delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap border-t pt-3 leading-relaxed">
            {article.body}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function DeleteConfirmDialog({
  article,
  open,
  onOpenChange,
}: {
  article: KnowledgeArticle;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("kennisbank");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteArticle = useDeleteKnowledgeArticle();

  const handleConfirm = () => {
    deleteArticle.mutate(
      { id: article.id },
      {
        onSuccess: () => {
          toast({ title: t("toast.deleted") });
          queryClient.invalidateQueries({ queryKey: ["/api/knowledge-articles"] });
          onOpenChange(false);
        },
        onError: () => toast({ variant: "destructive", title: t("toast.errorTitle"), description: t("toast.deleteError") }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            <Trans i18nKey="deleteDialog.confirm" ns="kennisbank" values={{ title: article.title }} components={[<strong key="0" />]} />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleteArticle.isPending}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteArticle.isPending}>
            {deleteArticle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("deleteDialog.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArticleFormDialog({
  open,
  onOpenChange,
  article,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  article?: KnowledgeArticle;
}) {
  const isEdit = !!article;
  const { t } = useTranslation("kennisbank");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useCreateKnowledgeArticle();
  const update = useUpdateKnowledgeArticle();
  const { data: ticketCategories } = useListTicketCategories();

  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [category, setCategory] = useState(article?.category ?? "algemeen");
  const [tagsInput, setTagsInput] = useState(article?.tags.join(", ") ?? "");
  const [selectedTicketCategoryIds, setSelectedTicketCategoryIds] = useState<number[]>(
    article?.ticketCategoryIds ?? [],
  );

  const isPending = create.isPending || update.isPending;

  const toggleTicketCategory = (id: number) => {
    setSelectedTicketCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const payload = { title: title.trim(), body: body.trim(), category, tags, ticketCategoryIds: selectedTicketCategoryIds };

    if (isEdit && article) {
      update.mutate(
        { id: article.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: t("toast.updated") });
            queryClient.invalidateQueries({ queryKey: ["/api/knowledge-articles"] });
            onOpenChange(false);
          },
          onError: () => toast({ variant: "destructive", title: t("toast.errorTitle"), description: t("toast.updateError") }),
        },
      );
    } else {
      create.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: t("toast.created") });
            queryClient.invalidateQueries({ queryKey: ["/api/knowledge-articles"] });
            onOpenChange(false);
          },
          onError: () => toast({ variant: "destructive", title: t("toast.errorTitle"), description: t("toast.createError") }),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.editTitle") : t("form.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("form.titleLabel")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("form.titlePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.categoryLabel")}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{t(`categories.${c}`, { defaultValue: c })}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.bodyLabel")}</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("form.bodyPlaceholder")}
              className="min-h-[140px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.tagsLabel")}</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t("form.tagsPlaceholder")} />
          </div>
          {ticketCategories && ticketCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("form.linkLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("form.linkHelp")}
              </p>
              <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
                {ticketCategories.map((tc) => (
                  <label key={tc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedTicketCategoryIds.includes(tc.id)}
                      onCheckedChange={() => toggleTicketCategory(tc.id)}
                    />
                    <span>{tc.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("form.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim() || !body.trim()}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KennisbankPage() {
  const { t } = useTranslation("kennisbank");
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<KnowledgeArticle | null>(null);
  const [deleteArticle, setDeleteArticle] = useState<KnowledgeArticle | null>(null);

  const params = { search: search || undefined, category: selectedCategory || undefined };
  const { data: articles, isLoading } = useListKnowledgeArticles(
    params,
    { query: { staleTime: 30_000, queryKey: getListKnowledgeArticlesQueryKey(params) } },
  );
  const { data: ticketCategories = [] } = useListTicketCategories();

  const canCreate = !!user && ["facilitair_manager", "beheerder", "servicedesk"].includes(user.role);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newArticle")}
          </Button>
        )}
      </div>

      {/* Search & category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={!selectedCategory ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory("")}
          >
            {t("all")}
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              variant={selectedCategory === c ? "secondary" : "outline"}
              size="sm"
              className="capitalize"
              onClick={() => setSelectedCategory(c === selectedCategory ? "" : c)}
            >
              {t(`categories.${c}`, { defaultValue: c })}
            </Button>
          ))}
        </div>
      </div>

      {/* Article list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !articles?.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {search ? t("emptyNoResults", { query: search }) : t("emptyNone")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              canEdit={canCreate}
              onEdit={setEditArticle}
              onDelete={setDeleteArticle}
              ticketCategories={ticketCategories}
            />
          ))}
        </div>
      )}

      {newDialogOpen && (
        <ArticleFormDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      )}
      {editArticle && (
        <ArticleFormDialog
          open={!!editArticle}
          onOpenChange={(o) => { if (!o) setEditArticle(null); }}
          article={editArticle}
        />
      )}
      {deleteArticle && (
        <DeleteConfirmDialog
          article={deleteArticle}
          open={!!deleteArticle}
          onOpenChange={(o) => { if (!o) setDeleteArticle(null); }}
        />
      )}
    </div>
  );
}
