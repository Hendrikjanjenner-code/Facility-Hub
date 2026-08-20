import { useLocation } from "wouter";
import { 
  useGetDashboardSummary, 
  useGetRecentActivity,
  useGetCurrentUser,
  useGetSatisfactionReport,
  getGetSatisfactionReportQueryKey
} from "@workspace/api-client-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { 
  Ticket, 
  AlertTriangle, 
  CalendarDays, 
  Users, 
  Monitor, 
  Building2, 
  Activity,
  ArrowRight,
  Star,
  Wrench
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  danger = false,
  onClick,
}: { 
  title: string, 
  value: number | string, 
  icon: any, 
  description?: string,
  danger?: boolean,
  onClick?: () => void,
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:border-primary/50 transition-colors" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${danger ? 'text-destructive' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${danger && Number(value) > 0 ? 'text-destructive' : ''}`}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const [, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading } = useGetRecentActivity();
  const canSeeSatisfaction = !!user && ["facilitair_manager", "beheerder"].includes(user.role);
  const { data: satisfactionReport } = useGetSatisfactionReport({
    query: { enabled: canSeeSatisfaction, queryKey: getGetSatisfactionReportQueryKey() },
  });

  if (isSummaryLoading || !user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Skeleton className="col-span-4 h-[400px] rounded-xl" />
          <Skeleton className="col-span-3 h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("welcome", { name: user.name.split(' ')[0] })}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        
        {user.role === 'eindgebruiker' && (
          <div className="flex gap-2">
            <Button onClick={() => setLocation("/meldingen/nieuw")}>
              <Ticket className="mr-2 h-4 w-4" />
              {t("newTicket")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Render cards based on role context. Backend populates irrelevant ones with 0, but we can also filter conditionally */}
        
        {(user.role === 'eindgebruiker' || user.role === 'servicedesk' || user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <StatCard 
            title={user.role === 'eindgebruiker' ? t("stats.myOpenTickets") : t("stats.openTickets")} 
            value={user.role === 'eindgebruiker' ? summary.myOpenTickets : summary.openTickets} 
            icon={Ticket} 
            description={t("stats.inProgress")} 
          />
        )}

        {(user.role === 'servicedesk' || user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <StatCard 
            title={t("stats.slaAtRisk")} 
            value={summary.slaAtRisk} 
            icon={AlertTriangle} 
            danger={true}
            description={t("stats.slaAtRiskDesc")} 
          />
        )}

        {(user.role !== 'servicedesk' && user.role !== 'leverancier') && (
          <StatCard 
            title={user.role === 'eindgebruiker' ? t("stats.myReservations") : t("stats.reservationsToday")} 
            value={user.role === 'eindgebruiker' ? summary.myReservationsToday : summary.reservationsToday} 
            icon={CalendarDays} 
            description={t("stats.roomsAndCatering")} 
          />
        )}

        {(user.role === 'eindgebruiker' || user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <StatCard 
            title={t("stats.workplaceBookings")} 
            value={summary.workplaceBookingsToday} 
            icon={Monitor} 
            description={t("stats.forToday")} 
          />
        )}

        {(user.role === 'receptie' || user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <StatCard 
            title={t("stats.visitors")} 
            value={`${summary.visitorsPresent} / ${summary.visitorsExpectedToday}`} 
            icon={Users} 
            description={t("stats.presentExpected")} 
          />
        )}
        
        {(user.role === 'beheerder') && (
          <StatCard 
            title={t("stats.totalAssets")} 
            value={summary.assetCount} 
            icon={Building2} 
            description={t("stats.registeredInSystem")} 
          />
        )}

        {(user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <StatCard
            title={t("stats.poorCondition")}
            value={summary.mjopSlechteConditie ?? 0}
            icon={Wrench}
            danger={true}
            description={t("stats.poorConditionDesc")}
            onClick={() => setLocation("/mjop?filter=slechteConditie")}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {(user.role === 'servicedesk' || user.role === 'facilitair_manager' || user.role === 'beheerder') && (
          <>
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>{t("charts.ticketsByStatus")}</CardTitle>
                <CardDescription>{t("charts.ticketsByStatusDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.ticketsByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="key" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} 
                        tickFormatter={(value) => value.replace('_', ' ')}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} 
                      />
                      <RechartsTooltip 
                        cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>{t("charts.priorityDistribution")}</CardTitle>
                <CardDescription>{t("charts.priorityDistributionDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.ticketsByPriority}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="key"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {summary.ticketsByPriority.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Satisfaction report for managers */}
        {canSeeSatisfaction && satisfactionReport && (satisfactionReport.closedTickets ?? 0) > 0 && (
          <Card className="col-span-4 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-400" />
                {t("satisfaction.title")}
              </CardTitle>
              <CardDescription>
                {satisfactionReport.totalResponses > 0
                  ? t("satisfaction.average", { score: satisfactionReport.averageScore?.toFixed(1) ?? "—" })
                  : null}
                {t("satisfaction.summary", {
                  responses: satisfactionReport.totalResponses,
                  closed: satisfactionReport.closedTickets,
                  rate: satisfactionReport.responseRate ?? 0,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {satisfactionReport.totalResponses === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("satisfaction.noRatings")}
                </p>
              ) : null}
              {[5,4,3,2,1].map((score) => {
                const entry = satisfactionReport.byScore?.find(b => b.key === String(score));
                const count = entry?.count ?? 0;
                const pct = satisfactionReport.totalResponses > 0
                  ? Math.round((count / satisfactionReport.totalResponses) * 100)
                  : 0;
                return (
                  <div key={score} className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-0.5 w-16 flex-shrink-0">
                      {Array.from({length:score}).map((_,i) => (
                        <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full transition-all" style={{width: `${pct}%`}} />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{count}</span>
                  </div>
                );
              })}

              {/* Top-3 categories with lowest response rate (only show categories that have closed tickets) */}
              {(() => {
                const withClosed = (satisfactionReport.byCategory ?? []).filter(c => c.closedTickets > 0);
                if (withClosed.length === 0) return null;
                const bottom3 = [...withClosed]
                  .sort((a, b) => a.responseRate - b.responseRate)
                  .slice(0, 3);
                return (
                  <div className="pt-3 border-t space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("satisfaction.lowestResponseRate")}
                    </p>
                    {bottom3.map((cat) => (
                      <div key={cat.categoryId} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate text-muted-foreground">{cat.categoryName}</span>
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
                          <div
                            className="h-full rounded-full transition-all bg-orange-400"
                            style={{ width: `${cat.responseRate}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-medium flex-shrink-0">
                          {cat.responseRate}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {satisfactionReport.recentResponses?.slice(0, 3).map((r) => (
                <div key={r.ticketId} className="pt-2 border-t first:border-t-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    {Array.from({length:r.score}).map((_,i) => (
                      <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{r.ticketTitle}</p>
                  {r.comment && <p className="text-xs italic text-muted-foreground truncate">"{r.comment}"</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Activity Feed for everyone */}
        <Card className={cn("col-span-4", user.role === 'eindgebruiker' || user.role === 'cateraar' || user.role === 'receptie' || user.role === 'leverancier' ? 'lg:col-span-7' : canSeeSatisfaction && satisfactionReport && satisfactionReport.totalResponses > 0 ? 'lg:col-span-4' : 'lg:col-span-4')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t("activity.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isActivityLoading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !activity?.length ? (
              <div className="text-center py-8 text-muted-foreground">{t("activity.empty")}</div>
            ) : (
              <div className="space-y-6">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 group">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: getDateFnsLocale() })}
                      </p>
                    </div>
                    {item.linkPath && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setLocation(item.linkPath!)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Simple internal cn helper for the dashboard
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
