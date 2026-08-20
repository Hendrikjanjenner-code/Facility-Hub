import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Modules } from "@/components/Modules";
import { Roles } from "@/components/Roles";
import { ContactSection } from "@/components/ContactSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-background font-sans text-foreground selection:bg-accent selection:text-white">
      <Navbar />
      <Hero />
      <Modules />
      <Roles />
      <ContactSection />
      <Footer />
    </main>
  );
}
