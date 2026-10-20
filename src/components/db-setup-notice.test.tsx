// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LangProvider } from "./lang-provider";
import { DbSetupNotice } from "./db-setup-notice";
import { I } from "@/lib/i18n";

afterEach(cleanup);

describe("DbSetupNotice — Étant donné une base injoignable (#3, NB9)", () => {
  it("Quand l'encart s'affiche, alors textes traduits et aucun détail d'exception", () => {
    const { container } = render(<LangProvider><DbSetupNotice /></LangProvider>);
    expect(screen.getByRole("heading").textContent).toBe(I.fr.dbTitle);
    expect(screen.getByText(I.fr.dbServerLog)).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
  });
});
