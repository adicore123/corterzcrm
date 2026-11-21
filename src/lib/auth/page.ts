import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, sessionCookie } from "./session";

export const currentUser = cache(async () => getUser((await cookies()).get(sessionCookie)?.value));

export async function authorizedUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
