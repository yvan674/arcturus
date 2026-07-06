import { getCurrentUser } from "@/lib/get-current-user";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/recordings");
  }

  redirect("/login");
}
