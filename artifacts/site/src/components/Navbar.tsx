import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Button } from "./ui/button";
import { motion } from "framer-motion";
import { Logo } from "./Logo";
import { useState, useEffect } from "react";

export function Navbar() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-background/90 backdrop-blur-lg border-b border-border/60 shadow-sm' : 'bg-transparent'}`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg">
          <Logo />
        </a>

        <div className="hidden md:flex items-center gap-8">
          {/* Using brand's dark/muted text color for institutional feel */}
          <a href="#modules" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded-sm">
            {t('nav.modules')}
          </a>
          <a href="#roles" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded-sm">
            {t('nav.roles')}
          </a>
          <a href="#contact" className="text-sm font-semibold text-foreground/80 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded-sm">
            {t('nav.contact')}
          </a>
        </div>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Button asChild className="hidden md:inline-flex bg-primary hover:bg-[#004FA8] text-white rounded-xl px-6 font-medium shadow-none transition-all">
            <a href="/gast">{t('nav.demo')}</a>
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
