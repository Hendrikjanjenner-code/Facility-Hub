import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { motion } from "framer-motion";

export function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-40 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-display font-bold text-primary leading-[1.1] mb-8">
              {t('hero.title')}
            </h1>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <p className="text-lg md:text-xl text-foreground/70 mb-12 max-w-2xl mx-auto leading-relaxed">
              {t('hero.subtitle')}
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button asChild size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white rounded-full px-8 h-14 text-base">
              <a href="/gast">{t('hero.cta')}</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto rounded-full px-8 h-14 text-base border-primary/20 text-primary hover:bg-primary/5">
              <a href="#contact">{t('hero.contact')}</a>
            </Button>
          </motion.div>
        </div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-20 mx-auto max-w-5xl rounded-2xl md:rounded-[2rem] border border-border/50 bg-white/50 p-2 md:p-4 shadow-2xl backdrop-blur-sm"
        >
          <div className="rounded-xl md:rounded-2xl overflow-hidden shadow-sm bg-muted border border-border/50 relative aspect-[16/10]">
            <img 
              src={import.meta.env.BASE_URL + "screenshots/dashboard.png"} 
              alt="LetShare4gov Dashboard"
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
