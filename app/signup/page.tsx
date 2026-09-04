import { SignupForm } from "@/components/auth/signup-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <SignupForm />
    </main>
  );
}
