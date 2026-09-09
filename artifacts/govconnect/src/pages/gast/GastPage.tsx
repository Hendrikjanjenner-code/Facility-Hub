import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/ui/logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export default function GastPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/guest-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message || t('guest.failed'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setLocation('/');
    } catch {
      setError(t('common.error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="mb-2">
            <Logo />
          </div>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            {t('guest.title')}
          </CardTitle>
          <CardDescription>{t('guest.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('guest.password')}
              autoFocus
            />
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={pending || !password}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('guest.submit')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                {t('guest.backToLogin')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
