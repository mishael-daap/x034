"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Company = { id: string; name: string; open_jobs_count: number };

export function CompaniesClient() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[] | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((d) => setCompanies(d.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Back
      </Button>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" />
            Company activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companies === null ? (
            <div className="grid gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <ul className="grid gap-2">
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">{c.name}</p>
                  <Badge variant="outline">
                    {c.open_jobs_count} open job{c.open_jobs_count === 1 ? "" : "s"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
