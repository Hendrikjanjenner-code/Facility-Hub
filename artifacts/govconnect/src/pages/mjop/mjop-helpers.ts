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

export function scoreLabel(score: number): string {
  switch (score) {
    case 1:
      return "Uitstekend";
    case 2:
      return "Goed";
    case 3:
      return "Redelijk";
    case 4:
      return "Matig";
    case 5:
      return "Slecht";
    case 6:
      return "Zeer slecht";
    default:
      return "Onbekend";
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

export function taakStatusLabel(status: string): string {
  switch (status) {
    case "gepland":
      return "Gepland";
    case "in_uitvoering":
      return "In uitvoering";
    case "afgerond":
      return "Afgerond";
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
