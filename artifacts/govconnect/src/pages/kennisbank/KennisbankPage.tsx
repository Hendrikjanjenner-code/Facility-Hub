import { useState } from "react";
import { useListKnowledgeArticles, useCreateKnowledgeArticle, useGetCurrentUser, getListKnowledgeArticlesQueryKey, KnowledgeArticle } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Search, Plus, Tag, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const CATEGORIES = ["algemeen", "klimaat", "schoonmaak", "technisch", "sanitair", "veiligheid", "reserveringen", "catering"];

function ArticleCard({ article }: { article: KnowledgeArticle }) {
  const [expanded, setExpanded] = useState(false);

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
                {article.category}
              </Badge>
              {article.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="flex-shrink-0 h-7 w-7" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
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

function NewArticleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useCreateKnowledgeArticle();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("algemeen");
  const [tagsInput, setTagsInput] = useState("");

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    create.mutate(
      { data: { title: title.trim(), body: body.trim(), category, tags } },
      {
        onSuccess: () => {
          toast({ title: "Artikel aangemaakt" });
          queryClient.invalidateQueries({ queryKey: ["/api/knowledge-articles"] });
          onOpenChange(false);
          setTitle(""); setBody(""); setTagsInput("");
        },
        onError: () => toast({ variant: "destructive", title: "Fout", description: "Kon artikel niet aanmaken." }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuw kennisbankartikel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Korte, duidelijke titel" />
          </div>
          <div className="space-y-1.5">
            <Label>Categorie</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Inhoud</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Geef een duidelijke uitleg of stap-voor-stap instructie..."
              className="min-h-[140px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (komma gescheiden)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="bijv. verwarming, storing, klimaat" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !title.trim() || !body.trim()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KennisbankPage() {
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const params = { search: search || undefined, category: selectedCategory || undefined };
  const { data: articles, isLoading } = useListKnowledgeArticles(
    params,
    { query: { staleTime: 30_000, queryKey: getListKnowledgeArticlesQueryKey(params) } },
  );

  const canCreate = !!user && ["facilitair_manager", "beheerder", "servicedesk"].includes(user.role);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kennisbank</h1>
          <p className="text-muted-foreground">Antwoorden op veelgestelde facilitaire vragen.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuw artikel
          </Button>
        )}
      </div>

      {/* Search & category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Zoek in kennisbank..."
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
            Alles
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              variant={selectedCategory === c ? "secondary" : "outline"}
              size="sm"
              className="capitalize"
              onClick={() => setSelectedCategory(c === selectedCategory ? "" : c)}
            >
              {c}
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
          <h3 className="text-lg font-medium">Geen artikelen gevonden</h3>
          <p className="text-sm text-muted-foreground">
            {search ? `Geen resultaten voor "${search}"` : "Er zijn nog geen kennisbankar artikelen aangemaakt."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {newDialogOpen && (
        <NewArticleDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      )}
    </div>
  );
}
