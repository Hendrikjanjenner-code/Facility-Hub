export const TAAK_TYPES = ["inspectie", "onderhoud", "vervanging", "renovatie"];
export const CATEGORIES = [
  "dak",
  "gevel",
  "installaties",
  "interieur",
  "terrein",
  "transport",
];
export const ERNST_OPTIES = ["licht", "serieus", "ernstig"];
export const OMVANG_OPTIES = ["< 2%", "2-10%", "10-30%", "30-70%", "> 70%"];
export const INTENSITEIT_OPTIES = ["laag", "midden", "hoog"];

// NL-SfB elementclassificatie (gangbare codes voor utiliteitsgebouwen)
export const NL_SFB_CODES: { code: string; label: string; category: string }[] = [
  { code: "(10)", label: "(10) Funderingen", category: "constructie" },
  { code: "(12)", label: "(12) Buitenste begane grondvloeren", category: "constructie" },
  { code: "(13)", label: "(13) Buitenwanden", category: "gevel" },
  { code: "(14)", label: "(14) Binnenwanden", category: "interieur" },
  { code: "(17)", label: "(17) Daken", category: "dak" },
  { code: "(21)", label: "(21) Vloeren en vlonders", category: "interieur" },
  { code: "(23)", label: "(23) Trappen en hellingen", category: "constructie" },
  { code: "(27)", label: "(27) Plafonds", category: "interieur" },
  { code: "(28)", label: "(28) Gevelbekleding", category: "gevel" },
  { code: "(31)", label: "(31) Ramen en bovenlichten", category: "gevel" },
  { code: "(32)", label: "(32) Binnendeuren en binnenpuien", category: "interieur" },
  { code: "(33)", label: "(33) Buitendeuren en buitenpuien", category: "gevel" },
  { code: "(34)", label: "(34) Balustrades en leuningen", category: "constructie" },
  { code: "(41)", label: "(41) Sanitaire installaties", category: "installaties" },
  { code: "(42)", label: "(42) Verwarmingsinstallaties", category: "installaties" },
  { code: "(43)", label: "(43) Warmwater-installaties", category: "installaties" },
  { code: "(44)", label: "(44) Gasinstallaties", category: "installaties" },
  { code: "(45)", label: "(45) Luchtbehandelingsinstallaties", category: "installaties" },
  { code: "(46)", label: "(46) Elektrische installaties", category: "installaties" },
  { code: "(47)", label: "(47) Communicatie-installaties", category: "installaties" },
  { code: "(48)", label: "(48) Beveiliging en bewaking", category: "installaties" },
  { code: "(52)", label: "(52) Liften en roltrappen", category: "transport" },
  { code: "(55)", label: "(55) Transportinstallaties", category: "transport" },
  { code: "(61)", label: "(61) Terreininrichting", category: "terrein" },
  { code: "(63)", label: "(63) Terreinverharding", category: "terrein" },
  { code: "(68)", label: "(68) Terreinleidingen", category: "terrein" },
];

/**
 * Leidt de NEN 2767-conditiescore (1–6) af uit de ergste gebreken.
 * Algoritme: bepaal de "zwaarte" van elk gebrek o.b.v. ernst × omvang × intensiteit
 * en vertaal dit naar een conditiescore.
 *
 * @returns score 1–6, of null als er geen gebreken zijn
 */
export function deriveNen2767Score(
  gebreken: Array<{
    ernst: string;
    omvang: string | null;
    intensiteit: string | null;
  }>,
): number | null {
  if (gebreken.length === 0) return null;

  const ernstVal: Record<string, number> = { licht: 1, serieus: 2, ernstig: 3 };
  const omvangVal: Record<string, number> = {
    "< 2%": 1,
    "2-10%": 2,
    "10-30%": 3,
    "30-70%": 4,
    "> 70%": 5,
  };
  const intensiteitVal: Record<string, number> = { laag: 1, midden: 2, hoog: 3 };

  // Bereken zwaarste gebrek
  let maxZwaarte = 0;
  for (const g of gebreken) {
    const e = ernstVal[g.ernst] ?? 1;
    const o = omvangVal[g.omvang ?? "< 2%"] ?? 1;
    const i = intensiteitVal[g.intensiteit ?? "midden"] ?? 2;
    const zwaarte = e * o * i;
    if (zwaarte > maxZwaarte) maxZwaarte = zwaarte;
  }

  // Schaal zwaarte (max = 3×5×3 = 45) naar score 1–6
  // Drempelwaarden op basis van NEN 2767 matrix
  if (maxZwaarte <= 1) return 1;
  if (maxZwaarte <= 3) return 2;
  if (maxZwaarte <= 8) return 3;
  if (maxZwaarte <= 18) return 4;
  if (maxZwaarte <= 30) return 5;
  return 6;
}

type TFunc = (key: string, options?: Record<string, unknown>) => string;

export function scoreLabel(score: number, t: TFunc): string {
  switch (score) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      return t(`score.${score}`);
    default:
      return t("score.unknown");
  }
}

export function scoreColor(score: number): string {
  switch (score) {
    case 1:
      return "bg-emerald-100 text-emerald-800";
    case 2:
      return "bg-green-100 text-green-800";
    case 3:
      return "bg-lime-100 text-lime-800";
    case 4:
      return "bg-amber-100 text-amber-800";
    case 5:
      return "bg-orange-100 text-orange-800";
    case 6:
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function taakStatusLabel(status: string, t: TFunc): string {
  switch (status) {
    case "gepland":
    case "in_uitvoering":
    case "afgerond":
      return t(`taakStatus.${status}`);
    default:
      return status;
  }
}

export function taakStatusColor(status: string): string {
  switch (status) {
    case "gepland":
      return "bg-blue-100 text-blue-800";
    case "in_uitvoering":
      return "bg-amber-100 text-amber-800";
    case "afgerond":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function ernstColor(ernst: string): string {
  switch (ernst) {
    case "licht":
      return "bg-yellow-100 text-yellow-800";
    case "serieus":
      return "bg-orange-100 text-orange-800";
    case "ernstig":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function euro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}
