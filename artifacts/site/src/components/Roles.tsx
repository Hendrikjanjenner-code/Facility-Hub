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
    <section id="roles" className="py-24 bg-primary text-white overflow-hidden relative">
      {/* Decorative backdrop */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-display font-bold mb-6"
          >
            {t('roles.title')}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-white/70"
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
                  "text-left px-6 py-4 rounded-xl transition-all duration-300 flex-shrink-0 whitespace-nowrap lg:whitespace-normal font-medium",
                  activeRole === role 
                    ? "bg-white text-primary shadow-lg scale-105 lg:scale-100 lg:translate-x-2"
                    : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
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
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="bg-white/10 backdrop-blur-md border border-white/10 p-8 md:p-12 rounded-3xl w-full"
              >
                <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mb-6">
                  <CheckCircle2 className="text-white w-6 h-6" />
                </div>
                <h3 className="text-3xl font-display font-bold mb-4">
                  {t(`roles.items.${activeRole}.title`)}
                </h3>
                <p className="text-xl text-white/80 leading-relaxed">
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
