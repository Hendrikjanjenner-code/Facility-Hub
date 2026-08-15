import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetCurrentUser } from '@workspace/api-client-react';

import LoginPage from './pages/login/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import MeldingenPage from './pages/meldingen/MeldingenPage';
import MeldingenNieuwPage from './pages/meldingen/MeldingenNieuwPage';
import MeldingDetailPage from './pages/meldingen/MeldingDetailPage';
import ReserveringenPage from './pages/reserveringen/ReserveringenPage';
import ReserveringDetailPage from './pages/reserveringen/ReserveringDetailPage';
import WerkplekkenPage from './pages/werkplekken/WerkplekkenPage';
import BezoekersPage from './pages/bezoekers/BezoekersPage';
import VastgoedPage from './pages/vastgoed/VastgoedPage';
import RuimtesPage from './pages/ruimtes/RuimtesPage';
import RuimteDetailPage from './pages/ruimtes/RuimteDetailPage';
import AssetsPage from './pages/assets/AssetsPage';
import AssetDetailPage from './pages/assets/AssetDetailPage';
import ContractenPage from './pages/contracten/ContractenPage';
import WebshopPage from './pages/webshop/WebshopPage';
import VoorraadPage from './pages/voorraad/VoorraadPage';
import DuurzaamheidPage from './pages/duurzaamheid/DuurzaamheidPage';

import { Shell } from './components/layout/Shell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
        return failureCount < 2;
      },
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { data: user, isLoading, error } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && error?.status === 401) {
      setLocation('/login');
    }
  }, [isLoading, error, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <Shell>
      <Component {...rest} />
    </Shell>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/login" component={LoginPage} />
        
        <Route path="/">{(params) => <ProtectedRoute component={DashboardPage} />}</Route>
        
        <Route path="/meldingen/nieuw">{(params) => <ProtectedRoute component={MeldingenNieuwPage} />}</Route>
        <Route path="/meldingen/:id">{(params) => <ProtectedRoute component={MeldingDetailPage} id={params.id} />}</Route>
        <Route path="/meldingen">{(params) => <ProtectedRoute component={MeldingenPage} />}</Route>
        
        <Route path="/reserveringen/:id">{(params) => <ProtectedRoute component={ReserveringDetailPage} id={params.id} />}</Route>
        <Route path="/reserveringen">{(params) => <ProtectedRoute component={ReserveringenPage} />}</Route>
        
        <Route path="/werkplekken">{(params) => <ProtectedRoute component={WerkplekkenPage} />}</Route>
        <Route path="/bezoekers">{(params) => <ProtectedRoute component={BezoekersPage} />}</Route>
        <Route path="/vastgoed">{(params) => <ProtectedRoute component={VastgoedPage} />}</Route>
        
        <Route path="/ruimtes/:id">{(params) => <ProtectedRoute component={RuimteDetailPage} id={params.id} />}</Route>
        <Route path="/ruimtes">{(params) => <ProtectedRoute component={RuimtesPage} />}</Route>
        
        <Route path="/assets/:id">{(params) => <ProtectedRoute component={AssetDetailPage} id={params.id} />}</Route>
        <Route path="/assets">{(params) => <ProtectedRoute component={AssetsPage} />}</Route>

        <Route path="/contracten">{(params) => <ProtectedRoute component={ContractenPage} />}</Route>
        <Route path="/webshop">{(params) => <ProtectedRoute component={WebshopPage} />}</Route>
        <Route path="/voorraad">{(params) => <ProtectedRoute component={VoorraadPage} />}</Route>
        <Route path="/duurzaamheid">{(params) => <ProtectedRoute component={DuurzaamheidPage} />}</Route>

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
