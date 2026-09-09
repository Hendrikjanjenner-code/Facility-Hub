import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

const MODULES = [
  { id: "dashboard", img: "dashboard.png" },
  { id: "meldingen", img: "meldingen.png" },
  { id: "reserveringen", img: "reserveringen.png" },
  { id: "werkplekken", img: "werkplekken.png" },
  { id: "bezoekers", img: "bezoekers.png" },
  { id: "vastgoed", img: "vastgoed.png" },
  { id: "ruimtes", img: "ruimtes.png" },
  { id: "assets", img: "assets.png" },
  { id: "contracten", img: "contracten.png" },
  { id: "webshop", img: "webshop.png" },
  { id: "duurzaamheid", img: "duurzaamheid.png" },
  { id: "mjop", img: "mjop.png" },
  { id: "kennisbank", img: "kennisbank.png" },
  { id: "sleutelbeheer", img: "sleutelbeheer.png" }
];

export function Modules() {
  const { t } = useTranslation();

  return (
    <section id="modules" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-3xl md:text-4xl font-sans font-bold text-[var(--ls4g-text)] mb-4 tracking-tight"
          >
            {t('modules.title')}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[var(--ls4g-text-muted)]"
          >
            {t('modules.subtitle')}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {MODULES.map((mod, i) => (
            <ModuleCard key={mod.id} mod={mod} index={i} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleCard({ mod, index, t }: { mod: any; index: number; t: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-[20px] bg-white border border-[var(--ls4g-border)] overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[var(--ls4g-blue)] transition-all duration-300 flex flex-col h-full"
    >
      <div className="aspect-[16/10] bg-[var(--ls4g-bg)] overflow-hidden relative border-b border-[var(--ls4g-border)]">
        <img 
          src={`${import.meta.env.BASE_URL}screenshots/${mod.img}`}
          alt={t(`modules.items.${mod.id}.title`)}
          className="w-full h-full object-cover object-top transition-transform duration-500 ease-out"
        />
        {/* Subtle overlay matching brand colors */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ls4g-dark)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <h3 className="text-xl font-sans font-semibold text-[var(--ls4g-text)] mb-2 group-hover:text-[var(--ls4g-blue)] transition-colors">
          {t(`modules.items.${mod.id}.title`)}
        </h3>
        <p className="text-[var(--ls4g-text-muted)] text-sm leading-relaxed flex-1">
          {t(`modules.items.${mod.id}.desc`)}
        </p>
      </div>
    </motion.div>
  );
}
