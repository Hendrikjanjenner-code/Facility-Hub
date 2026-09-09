import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { motion } from "framer-motion";

export function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-[var(--ls4g-bg)]">
      {/* Restrained geometric overlapping background panels */}
      <div className="absolute top-0 right-0 -mr-20 -mt-40 w-[800px] h-[1000px] opacity-[0.04] pointer-events-none transform rotate-12">
        <div className="absolute inset-0 bg-[#005FCC] transform skew-x-12 translate-x-20 rounded-3xl" />
        <div className="absolute inset-0 bg-[#0094FF] transform skew-x-12 -translate-x-10 translate-y-32 rounded-3xl" />
      </div>
      
      <div className="absolute bottom-0 left-0 -ml-40 w-[600px] h-[600px] opacity-[0.02] pointer-events-none transform -rotate-12">
        <div className="absolute inset-0 bg-[#0D141A] transform -skew-x-12 rounded-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-4xl md:text-6xl font-sans font-bold text-[var(--ls4g-text)] leading-[1.15] tracking-tight mb-8">
              {t('hero.title')}
            </h1>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-lg md:text-xl text-[var(--ls4g-text-muted)] mb-12 max-w-2xl mx-auto leading-relaxed">
              {t('hero.subtitle')}
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button asChild size="lg" className="w-full sm:w-auto bg-[var(--ls4g-blue-dark)] hover:bg-[#004FA8] text-white rounded-xl px-8 h-14 text-base font-semibold shadow-sm transition-all duration-300">
              <a href="/gast">{t('hero.cta')}</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-xl px-8 h-14 text-base font-semibold border-[var(--ls4g-border)] text-[var(--ls4g-text)] hover:bg-white hover:border-[var(--ls4g-blue)] transition-all duration-300 bg-transparent">
              <a href="#contact">{t('hero.contact')}</a>
            </Button>
          </motion.div>
        </div>

        {/* Dashboard Preview - Enterprise SaaS style */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-20 mx-auto max-w-5xl"
        >
          <div className="relative rounded-[24px] bg-white p-2 md:p-4 shadow-xl border border-[var(--ls4g-border)]">
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent pointer-events-none rounded-[24px]" />
            <div className="rounded-[16px] overflow-hidden shadow-inner bg-[var(--ls4g-bg)] border border-[var(--ls4g-border)] relative aspect-[16/10]">
              <img 
                src={import.meta.env.BASE_URL + "screenshots/dashboard.png"} 
                alt="LetShare4Gov Dashboard"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
