import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateContactRequest } from "@workspace/api-client-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function ContactSection() {
  const { t } = useTranslation();
  const mutation = useCreateContactRequest();

  const formSchema = z.object({
    name: z.string().min(1, t('contact.form.required')),
    email: z.string().email(t('contact.form.invalidEmail')),
    organization: z.string().optional(),
    message: z.string().min(1, t('contact.form.required')),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      organization: "",
      message: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate({
      data: {
        name: values.name,
        email: values.email,
        organization: values.organization,
        message: values.message,
      }
    });
  }

  return (
    <section id="contact" className="py-24 bg-[var(--ls4g-bg)] relative overflow-hidden">
      {/* Decorative overlapping geometric paths */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[300px] h-[500px] opacity-[0.03] pointer-events-none transform -rotate-12">
        <div className="absolute inset-0 bg-[#0D141A] transform -skew-x-12 -translate-x-20 rounded-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-lg"
          >
            <h2 className="text-4xl md:text-5xl font-sans font-bold text-[var(--ls4g-text)] mb-6 tracking-tight">
              {t('contact.title')}
            </h2>
            <p className="text-lg md:text-xl text-[var(--ls4g-text-muted)] mb-8">
              {t('contact.subtitle')}
            </p>
            <div className="w-16 h-1.5 bg-[var(--ls4g-blue)] rounded-full mb-8" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white p-8 md:p-10 rounded-[24px] shadow-[var(--shadow-xl)] border border-[var(--ls4g-border)] relative"
          >
            {/* Top-right corner geometric accent */}
            <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-[24px] pointer-events-none">
              <div className="absolute top-[-24px] right-[-24px] w-24 h-24 bg-[var(--ls4g-blue)] opacity-10 transform rotate-45" />
            </div>

            {mutation.isSuccess ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-[var(--ls4g-bg)] rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-[var(--ls4g-blue)]" />
                </div>
                <h3 className="text-2xl font-sans font-bold text-[var(--ls4g-text)] mb-4">
                  {t('contact.form.successTitle')}
                </h3>
                <p className="text-[var(--ls4g-text-muted)]">
                  {t('contact.form.successDesc')}
                </p>
                <Button 
                  variant="outline" 
                  className="mt-8 rounded-xl h-12 px-6 border-[var(--ls4g-border)] text-[var(--ls4g-text)] hover:bg-[var(--ls4g-bg)] font-semibold"
                  onClick={() => {
                    form.reset();
                    mutation.reset();
                  }}
                >
                  {t('contact.form.newRequest')}
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  {mutation.isError && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex gap-3 items-start">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="text-sm font-medium">
                        {mutation.error?.message || t('contact.form.error')}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[var(--ls4g-text)] font-semibold">{t('contact.form.name')}</FormLabel>
                          <FormControl>
                            <Input className="bg-[var(--ls4g-bg)] border-[var(--ls4g-border)] h-12 rounded-[12px] focus-visible:ring-[var(--ls4g-blue)]" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[var(--ls4g-text)] font-semibold">{t('contact.form.email')}</FormLabel>
                          <FormControl>
                            <Input type="email" className="bg-[var(--ls4g-bg)] border-[var(--ls4g-border)] h-12 rounded-[12px] focus-visible:ring-[var(--ls4g-blue)]" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="organization"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[var(--ls4g-text)] font-semibold">{t('contact.form.organization')}</FormLabel>
                        <FormControl>
                          <Input className="bg-[var(--ls4g-bg)] border-[var(--ls4g-border)] h-12 rounded-[12px] focus-visible:ring-[var(--ls4g-blue)]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[var(--ls4g-text)] font-semibold">{t('contact.form.message')}</FormLabel>
                        <FormControl>
                          <Textarea className="bg-[var(--ls4g-bg)] border-[var(--ls4g-border)] min-h-[120px] rounded-[12px] resize-y focus-visible:ring-[var(--ls4g-blue)]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-[12px] text-base font-semibold bg-[var(--ls4g-blue-dark)] hover:bg-[#004FA8] text-white transition-all shadow-sm"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? t('contact.form.submitting') : t('contact.form.submit')}
                  </Button>
                </form>
              </Form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
