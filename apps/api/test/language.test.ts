import { describe, it, expect } from "vitest";
import { isLikelyEnglish } from "../src/services/language.js";

const ENGLISH = `
  We are looking for a Senior Product Designer to join our team. You will
  work with engineering and product to ship polished experiences. The role
  requires strong systems thinking, clear communication, and experience with
  design tools. This is a remote-friendly position with a competitive salary.
`;

describe("English-only job filter", () => {
  it("keeps English postings", () => {
    expect(isLikelyEnglish("Senior Product Designer", ENGLISH)).toBe(true);
  });

  it("keeps short technical postings and snippets", () => {
    expect(isLikelyEnglish("Backend Engineer", "Build APIs with TypeScript and Go.")).toBe(true);
    expect(isLikelyEnglish("Designer", "Figma. React. Design systems.")).toBe(true);
  });

  it("does not reject English text full of ambiguous lookalike words", () => {
    const text = `
      The team is based at our office. You will work on a contract with a care
      team under the manager. No travel is required and we do not require a
      degree. Do you have at least ten years of experience? We offer a team
      bonus plus benefits. As a team, you will be at the center of the work.
    `;
    expect(isLikelyEnglish("Team Lead", text)).toBe(true);
  });

  it("rejects German postings", () => {
    const text =
      "Wir suchen einen Senior Product Designer für unser Team. Deine Aufgaben: Du gestaltest Produkte und arbeitest mit Engineering zusammen. Wir bieten flexible Arbeitszeiten und Homeoffice.";
    expect(isLikelyEnglish("Senior Product Designer (m/w/d)", text)).toBe(false);
  });

  it("rejects French postings", () => {
    const text =
      "Nous recherchons un designer produit pour rejoindre notre équipe. Vous travaillerez avec les équipes produit et engineering pour concevoir des expériences utiles. Le poste est basé à Paris.";
    expect(isLikelyEnglish("Designer Produit Senior", text)).toBe(false);
  });

  it("rejects Spanish postings", () => {
    const text =
      "Buscamos un diseñador de producto para unirse a nuestro equipo. Trabajarás con ingeniería y producto para crear experiencias claras. La oferta incluye salario competitivo y beneficios.";
    expect(isLikelyEnglish("Diseñador de Producto Senior", text)).toBe(false);
  });

  it("rejects Portuguese postings", () => {
    const text =
      "Estamos procurando um designer de produto para se juntar à nossa equipe. Você trabalhará com engenharia e produto para criar experiências claras. A vaga oferece salário competitivo e benefícios.";
    expect(isLikelyEnglish("Designer de Produto Sênior", text)).toBe(false);
  });

  it("rejects Dutch postings", () => {
    const text =
      "Wij zoeken een productontwerper voor ons team. Je werkt met engineering en product aan duidelijke ervaringen. De functie biedt een competitief salaris en goede arbeidsvoorwaarden.";
    expect(isLikelyEnglish("Senior Productontwerper", text)).toBe(false);
  });

  it("rejects non-Latin scripts", () => {
    expect(
      isLikelyEnglish(
        "プロダクトデザイナー",
        "私たちはプロダクトデザイナーを募集しています。エンジニアリングチームと協力して、優れたユーザー体験を設計します。",
      ),
    ).toBe(false);
    expect(
      isLikelyEnglish(
        "Продуктовый дизайнер",
        "Мы ищем старшего продуктового дизайнера в нашу команду. Вы будете работать с инженерами и продуктом.",
      ),
    ).toBe(false);
  });

  it("strips markup before checking", () => {
    expect(
      isLikelyEnglish("Role", "<p>Build <b>TypeScript</b> services for the team.</p>"),
    ).toBe(true);
  });
});
