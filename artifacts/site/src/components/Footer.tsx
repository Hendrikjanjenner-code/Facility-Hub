import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[var(--ls4g-dark)] border-t border-white/5 text-white py-16">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex flex-col items-center md:items-start gap-4">
          <Logo light={true} />
          <p className="text-white/50 text-sm max-w-xs text-center md:text-left leading-relaxed">
            {t('hero.subtitle')}
          </p>
        </div>
        
        <div className="flex flex-col items-center md:items-end gap-4">
          <div className="flex gap-6 text-sm font-medium text-white/70">
            <a href="#modules" className="hover:text-white transition-colors">{t('nav.modules')}</a>
            <a href="#roles" className="hover:text-white transition-colors">{t('nav.roles')}</a>
            <a href="#contact" className="hover:text-white transition-colors">{t('nav.contact')}</a>
          </div>
          <div className="text-white/60 text-sm">
            {t('footer.rights', { year })}
          </div>
        </div>
      </div>
    </footer>
  );
}
