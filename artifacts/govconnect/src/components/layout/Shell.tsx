import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  useGetCurrentUser, 
  useLogout, 
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  User 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Ticket, 
  CalendarDays, 
  Monitor, 
  Users, 
  Building2, 
  DoorOpen, 
  PcCase,
  Wrench,
  Bell,
  LogOut,
  User as UserIcon,
  Check,
  FileText,
  ShoppingCart,
  Boxes,
  Leaf,
  BookOpen
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  title: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
};

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["eindgebruiker", "servicedesk", "facilitair_manager", "cateraar", "receptie", "beheerder", "leverancier"]
  },
  {
    title: "Meldingen",
    href: "/meldingen",
    icon: Ticket,
    roles: ["eindgebruiker", "servicedesk", "facilitair_manager", "beheerder", "leverancier"]
  },
  {
    title: "Reserveringen",
    href: "/reserveringen",
    icon: CalendarDays,
    roles: ["eindgebruiker", "facilitair_manager", "cateraar", "receptie", "beheerder"]
  },
  {
    title: "Werkplekken",
    href: "/werkplekken",
    icon: Monitor,
    roles: ["eindgebruiker", "facilitair_manager", "beheerder"]
  },
  {
    title: "Bezoekers",
    href: "/bezoekers",
    icon: Users,
    roles: ["eindgebruiker", "facilitair_manager", "receptie", "beheerder"]
  },
  {
    title: "Vastgoed",
    href: "/vastgoed",
    icon: Building2,
    roles: ["facilitair_manager", "beheerder"]
  },
  {
    title: "Ruimtes",
    href: "/ruimtes",
    icon: DoorOpen,
    roles: ["servicedesk", "facilitair_manager", "beheerder"]
  },
  {
    title: "Assets",
    href: "/assets",
    icon: PcCase,
    roles: ["servicedesk", "facilitair_manager", "beheerder"]
  },
  {
    title: "Contracten",
    href: "/contracten",
    icon: FileText,
    roles: ["facilitair_manager", "beheerder", "leverancier"]
  },
  {
    title: "Webshop",
    href: "/webshop",
    icon: ShoppingCart,
    roles: ["eindgebruiker", "servicedesk", "facilitair_manager", "cateraar", "receptie", "beheerder"]
  },
  {
    title: "Voorraad",
    href: "/voorraad",
    icon: Boxes,
    roles: ["servicedesk", "facilitair_manager", "beheerder"]
  },
  {
    title: "Duurzaamheid",
    href: "/duurzaamheid",
    icon: Leaf,
    roles: ["servicedesk", "facilitair_manager", "beheerder"]
  },
  {
    title: "MJOP",
    href: "/mjop",
    icon: Wrench,
    roles: ["facilitair_manager", "beheerder"]
  },
  {
    title: "Kennisbank",
    href: "/kennisbank",
    icon: BookOpen,
    roles: ["eindgebruiker", "servicedesk", "facilitair_manager", "cateraar", "receptie", "beheerder", "leverancier"]
  }
];

function NotificationsDropdown() {
  const { data: notifications } = useListNotifications();
  const unreadCount = notifications?.filter(n => !n.read).length || 0;
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleNotificationClick = (notification: any) => {
    if (!notification.read) {
      markRead.mutate({ id: notification.id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
      });
    }
    if (notification.linkPath) {
      setLocation(notification.linkPath);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold text-sm">Notificaties</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={handleMarkAllRead}>
              <Check className="mr-1 h-3 w-3" />
              Alles gelezen
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {!notifications?.length ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Geen notificaties
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-4 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                      n.read ? "bg-transparent" : "bg-primary"
                    )} />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium leading-none">{n.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                      <span className="text-xs text-muted-foreground mt-1">
                        {new Date(n.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ user }: { user: User }) {
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full border">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
            <span className="text-xs font-medium">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Rol: <span className="font-medium text-foreground capitalize">{user.role.replace('_', ' ')}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Uitloggen</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetCurrentUser();

  if (!user) return <>{children}</>;

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card h-screen sticky top-0">
        <div className="flex h-14 items-center border-b px-6">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight text-primary">
            <Building2 className="h-5 w-5" />
            <span>GovConnect</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <nav className="grid gap-1 px-4">
            {filteredNav.map((item) => {
              const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted cursor-pointer",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                    {item.title}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t p-4 flex items-center justify-between">
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</span>
          </div>
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 md:px-6 sticky top-0 z-10">
          <div className="md:hidden flex-1 flex items-center gap-2 font-bold text-lg text-primary">
            <Building2 className="h-5 w-5" />
            <span>GovConnect</span>
          </div>
          <div className="flex-1 hidden md:block" />
          <div className="flex items-center gap-4">
            <NotificationsDropdown />
            <div className="md:hidden">
              <UserMenu user={user} />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-background/50">
          <div className="container mx-auto p-4 md:p-6 max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
