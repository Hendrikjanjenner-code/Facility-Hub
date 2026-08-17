import { useState } from "react";
import { useLocation } from "wouter";
import { useGetStructure } from "@workspace/api-client-react";
import { 
  Building2, 
  Map, 
  Building, 
  Layers, 
  DoorOpen, 
  ChevronRight, 
  ChevronDown,
  ExternalLink
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function TreeNode({ 
  label, 
  icon: Icon, 
  children, 
  defaultExpanded = false,
  badge,
  action
}: { 
  label: string, 
  icon: any, 
  children?: React.ReactNode, 
  defaultExpanded?: boolean,
  badge?: React.ReactNode,
  action?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = !!children;

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center justify-between py-2 px-2 hover:bg-muted/50 rounded-md transition-colors",
          hasChildren && "cursor-pointer"
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 flex justify-center">
            {hasChildren ? (
              expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : null}
          </div>
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{label}</span>
          {badge}
        </div>
        {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
      </div>
      {expanded && hasChildren && (
        <div className="ml-6 pl-2 border-l border-border mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

export default function VastgoedPage() {
  const [, setLocation] = useLocation();
  const { data: structure, isLoading } = useGetStructure();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vastgoedstructuur</h1>
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-1/3 mb-4" />
            <Skeleton className="h-8 w-1/2 ml-6 mb-2" />
            <Skeleton className="h-8 w-2/3 ml-12 mb-2" />
            <Skeleton className="h-8 w-2/3 ml-12 mb-2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!structure) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vastgoedstructuur</h1>
        <p className="text-muted-foreground">Overzicht van organisatie, vestigingen, gebouwen en verdiepingen.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Structuurboom</CardTitle>
          <CardDescription>Navigeer door de hiërarchie om ruimtes te bekijken.</CardDescription>
        </CardHeader>
        <CardContent>
          {structure.map(org => (
          <TreeNode key={org.id} label={org.name} icon={Building2} defaultExpanded>
            {org.sites.map(site => (
              <TreeNode key={site.id} label={`${site.name} (${site.city})`} icon={Map} defaultExpanded>
                {site.buildings.map(building => (
                  <TreeNode 
                    key={building.id} 
                    label={building.name} 
                    icon={Building}
                    action={
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => setLocation(`/gebouwen/${building.id}`)}
                        data-testid={`link-gebouw-${building.id}`}
                      >
                        <ExternalLink className="mr-1 h-3 w-3" /> Gebouwdossier
                      </Button>
                    }
                  >
                    {building.floors.map(floor => (
                      <TreeNode 
                        key={floor.id} 
                        label={`${floor.name} (Niveau ${floor.level})`} 
                        icon={Layers}
                        badge={<Badge variant="secondary" className="text-[10px] ml-2 font-normal">{floor.roomCount} ruimtes</Badge>}
                        action={
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => setLocation(`/ruimtes?floorId=${floor.id}`)}
                          >
                            <DoorOpen className="mr-1 h-3 w-3" /> Toon ruimtes
                          </Button>
                        }
                      />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
