import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/page";
import { sessionCookie } from "@/lib/auth/session";

export default async function Home() {
  const rawToken = (await cookies()).get(sessionCookie)?.value;
  if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) {
    redirect("/login");
  }
  const user = await currentUser();
  redirect(user ? "/dashboard" : "/login");
}
