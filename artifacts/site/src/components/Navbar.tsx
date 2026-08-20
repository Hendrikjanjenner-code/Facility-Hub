import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "./ui/button";
import { motion } from "framer-motion";

export function Navbar() {
  const { t } = useTranslation();

  return (
    <motion.nav 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <div className="w-3 h-3 bg-accent rounded-sm" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight text-primary">
            LetShare<span className="text-accent">4gov</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#modules" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
            {t('nav.modules')}
          </a>
          <a href="#roles" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
            {t('nav.roles')}
          </a>
          <a href="#contact" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
            {t('nav.contact')}
          </a>
        </div>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Button asChild className="hidden md:inline-flex bg-primary hover:bg-primary/90 text-white rounded-full px-6">
            <a href="/gast">{t('nav.demo')}</a>
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
