import { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useLogin, 
  useListDemoAccounts, 
  useGetCurrentUser 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Building2, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

type LoginFormValues = { email: string; password: string };

export default function LoginPage() {
  const { t } = useTranslation();
  const loginSchema = z.object({
    email: z.string().email(t("login.emailInvalid")),
    password: z.string().min(1, t("login.passwordRequired")),
  });
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isLoadingUser } = useGetCurrentUser();
  const { data: demoAccounts } = useListDemoAccounts();
  const loginMutation = useLogin();

  useEffect(() => {
    if (!isLoadingUser && user) {
      setLocation("/");
    }
  }, [user, isLoadingUser, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/");
      },
    });
  };

  const handleDemoClick = (email: string) => {
    form.setValue("email", email);
    form.setValue("password", "demo2026");
    form.handleSubmit(onSubmit)();
  };

  if (isLoadingUser) return null;

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-primary p-10 text-primary-foreground">
        <div>
          <div className="flex items-center gap-2 font-bold text-2xl mb-12">
            <Building2 className="h-8 w-8" />
            <span>{t("brand")}</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight max-w-md mb-6">
            {t("login.tagline")}
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            {t("login.taglineSub")}
          </p>
        </div>
        <div className="text-sm text-primary-foreground/60">
          &copy; {new Date().getFullYear()} LetShare4gov. {t("login.copyright")}
        </div>
      </div>
      
      <div className="relative flex flex-col justify-center p-8 md:p-12 lg:p-24 bg-background">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <LanguageSwitcher variant="outline" />
        </div>
        <div className="md:hidden flex items-center gap-2 font-bold text-2xl text-primary mb-8">
          <Building2 className="h-8 w-8" />
          <span>{t("brand")}</span>
        </div>

        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">{t("login.title")}</h2>
            <p className="text-muted-foreground">
              {t("login.subtitle")}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("login.email")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("login.emailPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("login.password")}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {loginMutation.isError && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                  {loginMutation.error?.message || t("login.failed")}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("login.submit")}
              </Button>
            </form>
          </Form>

          <p className="text-sm text-center text-muted-foreground">
            <Link href="/gast" className="underline underline-offset-4 hover:text-primary">
              {t("login.guestLink")}
            </Link>
          </p>

          {demoAccounts && demoAccounts.length > 0 && (
            <div className="mt-12 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("login.demo")}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <Card 
                    key={account.email} 
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => handleDemoClick(account.email)}
                  >
                    <div className="p-3 flex flex-col justify-between h-full">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm truncate pr-2">{account.name}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <Badge variant="secondary" className="w-fit text-xs font-normal">
                        {account.roleLabel}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
