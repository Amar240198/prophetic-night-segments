import { redirect } from "next/navigation";
import { readAppUser } from "./session.server";
import { signInPath } from "./redirect";

/** Only ownership-dependent pages require an account. API authorization is independent. */
export async function requireAccountPage(path: string) {
  const user = await readAppUser();
  if (!user) redirect(signInPath(path));
  return user;
}
