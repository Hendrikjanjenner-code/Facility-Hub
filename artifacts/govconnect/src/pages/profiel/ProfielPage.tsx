import { useState, useEffect } from "react";
import { useGetCurrentUser, useUpdateMyPreferences } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, BellOff } from "lucide-react";

const OPTIONS = [
  {
    value: "inapp_only",
    label: "Alleen in-app",
    description: "U ontvangt meldingen alleen binnen de applicatie, geen e-mails.",
    icon: BellOff,
  },
  {
    value: "email",
    label: "Alleen e-mail",
    description: "U ontvangt uitsluitend een e-mail bij kritieke contractwaarschuwingen, geen in-app melding.",
    icon: Mail,
  },
  {
    value: "all",
    label: "In-app én e-mail (standaard)",
    description: "U ontvangt zowel een in-app melding als een e-mail bij kritieke contractwaarschuwingen.",
    icon: Bell,
  },
];

export default function ProfielPage() {
  const { data: user } = useGetCurrentUser();
  const updatePreferences = useUpdateMyPreferences();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [preference, setPreference] = useState<string>("all");

  // Sync once when user data arrives (avoids stale "email" default on first load)
  useEffect(() => {
    if (user?.notificationPreference) {
      setPreference(user.notificationPreference);
    }
  }, [user?.notificationPreference]);

  const currentPref = user?.notificationPreference ?? "all";

  const handleSave = () => {
    updatePreferences.mutate(
      { data: { notificationPreference: preference } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          toast({ title: "Voorkeuren opgeslagen", description: "Uw meldingsinstellingen zijn bijgewerkt." });
        },
        onError: () => {
          toast({ title: "Fout", description: "Kon voorkeuren niet opslaan. Probeer het opnieuw.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mijn profiel</h1>
        <p className="text-muted-foreground mt-1">Beheer uw persoonlijke instellingen.</p>
      </div>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle>Accountgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28">Naam</span>
              <span className="font-medium">{user.name}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28">E-mailadres</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28">Rol</span>
              <span className="font-medium capitalize">{user.role.replace("_", " ")}</span>
            </div>
            {user.department && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28">Afdeling</span>
                <span className="font-medium">{user.department}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vervalwaarschuwingen</CardTitle>
          <CardDescription>
            Kies hoe u gewaarschuwd wilt worden als een contract op korte termijn verloopt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={preference}
            onValueChange={setPreference}
            className="space-y-3"
          >
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <div key={opt.value} className="flex items-start gap-3">
                  <RadioGroupItem value={opt.value} id={opt.value} className="mt-1" />
                  <Label htmlFor={opt.value} className="cursor-pointer space-y-0.5">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {opt.label}
                    </div>
                    <p className="text-sm text-muted-foreground font-normal">{opt.description}</p>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={updatePreferences.isPending || preference === currentPref}
            >
              {updatePreferences.isPending ? "Opslaan…" : "Opslaan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
