// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("./app-context", () => ({ useApp: () => ({ t: I.fr }) }));

import { I } from "@/lib/i18n";
import { RelayCell, fmt } from "./relay-cell";

afterEach(cleanup);

describe("RelayCell — case d'étape de la fiche d'unité", () => {
  it("Quand l'étape n'est pas faite, alors « — » (t.none), ni date ni écran", () => {
    const { container } = render(<RelayCell label="Montage" who={null} date={null} screen={null} />);
    expect(screen.getByText("Montage")).toBeTruthy();
    expect(screen.getByText(I.fr.none)).toBeTruthy();
    expect(screen.queryByText(I.fr.stationUnknown)).toBeNull();
    expect(container.firstElementChild?.className).not.toContain("text-pass");
  });

  it("Quand l'étape est faite, alors l'opérateur en vert, la date et l'écran", () => {
    render(<RelayCell label="Montage" who="Ana" date="2026-10-02T14:05:00.000Z" screen="Établi 2" />);
    expect(screen.getByText("Ana").className).toContain("text-pass");
    expect(screen.getByText(fmt("2026-10-02T14:05:00.000Z", "—"))).toBeTruthy();
    expect(screen.getByText("Établi 2")).toBeTruthy();
  });

  it("Quand l'étape est refusée, alors l'opérateur en rouge ; sans écran, « Écran non identifié »", () => {
    render(<RelayCell label="Test" who="Léo" date={null} screen={null} bad />);
    expect(screen.getByText("Léo").className).toContain("text-fail");
    expect(screen.getByText(I.fr.stationUnknown)).toBeTruthy();
  });

  it("fmt : sans date, la valeur de repli", () => {
    expect(fmt(null, "—")).toBe("—");
  });
});
