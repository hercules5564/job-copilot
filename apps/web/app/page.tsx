import type { Metadata } from "next";
import { SiteNav } from "../components/site/nav";
import { Hero } from "../components/site/hero";
import {
  BookSection,
  CtaStrip,
  FooterCta,
  Intro,
  LogoStrip,
  SiteFooter,
  WordSearchSection,
} from "../components/site/sections";
import { BlueSection, ProductStages } from "../components/site/stages";
import { FaqSection } from "../components/site/faq";
import { Mascot } from "../components/site/mascot";

export const metadata: Metadata = {
  title: "JobPilot — The AI job search operating system",
  description:
    "Discover roles across the boards you already check, match against your real experience, and prepare applications with human-approved context.",
};

export default function Home() {
  return (
    <div className="cf-page">
      <SiteNav />
      <main>
        <Hero />
        <LogoStrip />
        <Intro />
        <CtaStrip />
        <ProductStages />
        <BookSection />
        <BlueSection />
        <WordSearchSection />
        <FaqSection />
        <FooterCta />
      </main>
      <SiteFooter />
      <Mascot />
    </div>
  );
}
