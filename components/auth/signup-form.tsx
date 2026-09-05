"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { markRulesOnboardingPending } from "@/lib/onboarding";
import {
  emailError,
  nameError,
  passwordError,
  phoneError,
  referralCodeError,
} from "@/lib/validation";

type Errors = Partial<Record<"name" | "email" | "phone" | "password" | "referral_code", string>>;

export function SignupForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function clearField(field: keyof Errors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const raw = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
      referral_code: String(form.get("referral_code") ?? ""),
    };

    const next: Errors = {
      name: nameError(raw.name) ?? undefined,
      email: emailError(raw.email) ?? undefined,
      phone: phoneError(raw.phone) ?? undefined,
      password: passwordError(raw.password) ?? undefined,
      referral_code: referralCodeError(raw.referral_code) ?? undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    const body: Record<string, unknown> = {
      name: raw.name.trim(),
      email: raw.email.trim().toLowerCase(),
      phone: raw.phone.trim(),
      password: raw.password,
    };
    const referralCode = raw.referral_code.trim();
    if (referralCode) body.referral_code = referralCode.toUpperCase();

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Try again.");
      return;
    }

    markRulesOnboardingPending();
    // Admins land on the admin app; everyone else on their dashboard.
    router.push(data?.user?.role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Sign up with your email and phone number</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Ada Obi"
              autoComplete="name"
              onChange={() => clearField("name")}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              onChange={() => clearField("email")}
            />
            <FieldError message={errors.email} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="e.g. 08012345678 or +2348012345678"
              autoComplete="tel"
              onChange={() => clearField("phone")}
            />
            <FieldError message={errors.phone} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters, letters and numbers"
              autoComplete="new-password"
              onChange={() => clearField("password")}
            />
            <FieldError message={errors.password} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="referral_code">Referral code (optional)</Label>
            <Input
              id="referral_code"
              name="referral_code"
              placeholder="e.g. AB2CDE3F"
              autoCapitalize="characters"
              onChange={() => clearField("referral_code")}
            />
            <FieldError message={errors.referral_code} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="h-10 w-full">
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
