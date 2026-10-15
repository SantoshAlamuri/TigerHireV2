import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompanyOffersPage from "@/app/(dashboard)/company/offers/page";

const auth = vi.hoisted(() => ({ role: "recruiter" }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: auth }) }));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: { offers: [] }, loading: false, refetch: vi.fn() }),
}));
vi.mock("@/components/dashboard/HiringOfferAuditTimeline", () => ({
  HiringOfferAuditTimeline: () => null,
}));
vi.mock("@/components/dashboard/OfferSigningPanel", () => ({ OfferSigningPanel: () => null }));
vi.mock("@/components/dashboard/RequisitionThreadBanner", () => ({
  RequisitionThreadBanner: () => null,
  hiringRequestFromJobRow: () => null,
}));

afterEach(cleanup);

describe("canonical offer workspace role context", () => {
  it.each([
    ["recruiter", "/recruit/pipeline", "Recruiter home", "/recruit"],
    ["leadership", "/recruit/pipeline", "Hiring requests", "/company/hiring-requests"],
    ["hiring_manager", "/company/my-pipeline", "Hiring requests", "/company/hiring-requests"],
  ])(
    "keeps %s navigation correct after canonical redirect",
    (role, pipeline, backLabel, backHref) => {
      auth.role = role;
      render(<CompanyOffersPage />);
      expect(screen.getByRole("link", { name: "Open pipeline" }).getAttribute("href")).toBe(
        pipeline,
      );
      expect(screen.getByRole("link", { name: backLabel }).getAttribute("href")).toBe(backHref);
    },
  );
});
