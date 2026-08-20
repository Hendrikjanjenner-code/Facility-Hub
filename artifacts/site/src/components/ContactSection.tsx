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
    <section id="contact" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-lg"
          >
            <h2 className="text-4xl md:text-5xl font-display font-bold text-primary mb-6">
              {t('contact.title')}
            </h2>
            <p className="text-xl text-foreground/70 mb-8">
              {t('contact.subtitle')}
            </p>
            <div className="w-24 h-1 bg-accent rounded-full mb-8" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-border/50"
          >
            {mutation.isSuccess ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h3 className="text-2xl font-display font-bold text-primary mb-4">
                  {t('contact.form.successTitle')}
                </h3>
                <p className="text-foreground/70">
                  {t('contact.form.successDesc')}
                </p>
                <Button 
                  variant="outline" 
                  className="mt-8"
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
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {mutation.isError && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex gap-3 items-start">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="text-sm font-medium">
                        {mutation.error?.message || t('contact.form.error')}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-primary font-medium">{t('contact.form.name')}</FormLabel>
                          <FormControl>
                            <Input className="bg-background h-12 rounded-xl" {...field} />
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
                          <FormLabel className="text-primary font-medium">{t('contact.form.email')}</FormLabel>
                          <FormControl>
                            <Input type="email" className="bg-background h-12 rounded-xl" {...field} />
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
                        <FormLabel className="text-primary font-medium">{t('contact.form.organization')}</FormLabel>
                        <FormControl>
                          <Input className="bg-background h-12 rounded-xl" {...field} />
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
                        <FormLabel className="text-primary font-medium">{t('contact.form.message')}</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background min-h-[120px] rounded-xl resize-y" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-14 rounded-xl text-base font-semibold bg-primary hover:bg-primary/90 text-white"
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
