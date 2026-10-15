import { redirect } from "next/navigation";

export default function EmployeeMyReferralsRedirectPage() {
  redirect("/employee?tab=referrals");
}
