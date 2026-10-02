import type { Metadata } from "next";
import { AuthForm } from "@/components/product/AuthForm";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AuthForm mode="reset" />;
}
