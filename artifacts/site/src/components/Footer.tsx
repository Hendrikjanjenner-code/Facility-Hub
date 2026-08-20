import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-primary border-t border-white/10 text-white py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
            <div className="w-2 h-2 bg-accent rounded-sm" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            LetShare<span className="text-accent">4gov</span>
          </span>
        </div>
        
        <div className="text-white/60 text-sm text-center md:text-left">
          {t('footer.rights', { year })}
        </div>
      </div>
    </footer>
  );
}
