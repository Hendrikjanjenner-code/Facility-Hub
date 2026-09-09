import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

const ROLES = [
  "eindgebruiker",
  "servicedesk",
  "facilitair_manager",
  "cateraar",
  "receptie",
  "beheerder",
  "leverancier"
];

export function Roles() {
  const { t } = useTranslation();
  const [activeRole, setActiveRole] = useState(ROLES[0]);

  return (
    <section id="roles" className="py-24 bg-[var(--ls4g-dark)] text-white overflow-hidden relative">
      {/* Restrained geometric overlapping background panels */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[800px] opacity-20 pointer-events-none transform rotate-12">
        <div className="absolute inset-0 bg-[var(--ls4g-dark-surface)] transform skew-x-12 translate-x-10 rounded-3xl" />
        <div className="absolute inset-0 bg-[#005FCC]/10 transform skew-x-12 -translate-x-10 translate-y-20 rounded-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-sans font-bold mb-4 tracking-tight"
          >
            {t('roles.title')}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-white/60"
          >
            {t('roles.subtitle')}
          </motion.p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-start">
          <div className="w-full lg:w-1/3 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide">
            {ROLES.map((role) => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={clsx(
                  "text-left px-6 py-4 rounded-[12px] transition-all duration-300 flex-shrink-0 whitespace-nowrap lg:whitespace-normal font-medium border border-transparent",
                  activeRole === role 
                    ? "bg-[var(--ls4g-blue)]/10 text-white border-[var(--ls4g-blue)]/30 lg:translate-x-2"
                    : "bg-transparent text-white/50 hover:bg-white/5 hover:text-white"
                )}
              >
                {t(`roles.items.${role}.title`)}
              </button>
            ))}
          </div>
          
          <div className="w-full lg:w-2/3 min-h-[300px] relative flex items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRole}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="bg-[var(--ls4g-dark-surface)] border border-white/5 p-8 md:p-12 rounded-[24px] w-full shadow-2xl"
              >
                <div className="w-12 h-12 bg-[var(--ls4g-blue)]/10 rounded-xl flex items-center justify-center mb-6">
                  <CheckCircle2 className="text-[var(--ls4g-blue)] w-6 h-6" />
                </div>
                <h3 className="text-2xl font-sans font-semibold mb-4 text-white">
                  {t(`roles.items.${activeRole}.title`)}
                </h3>
                <p className="text-lg text-white/70 leading-relaxed">
                  {t(`roles.items.${activeRole}.desc`)}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
