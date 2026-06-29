import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function getUsername(): Promise<string> {
  const cookieStore = await cookies();
  const username = cookieStore.get("bv_username")?.value;
  if (!username) redirect("/");
  return decodeURIComponent(username);
}
