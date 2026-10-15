import { redirect } from "next/navigation";

/** Legacy path from brief top-nav experiment — hub tabs live on `/employee`. */
export default function EmployeeOpenRolesRedirectPage() {
  redirect("/employee");
}
