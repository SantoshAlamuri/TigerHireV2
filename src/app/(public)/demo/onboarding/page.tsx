import { notFound } from "next/navigation";
import Walkthrough from "./Walkthrough";

export const metadata = {
  title: "Company onboarding walkthrough",
  robots: { index: false, follow: false },
};

export default function OnboardingDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Walkthrough />;
}
