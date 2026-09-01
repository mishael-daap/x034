"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NodeItem = {
  id: string;
  tier_code: string;
  tier_name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  status: "available" | "committed" | "active";
  assignment: {
    job_id: string;
    company: string;
    status: string;
    estimated_earnings: number;
  } | null;
};

type NodesData = { balance: number; nodes: NodeItem[] };

export function NodesClient() {
  const [data, setData] = useState<NodesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/nodes")
      .then((r) => {
        if (r.status === 401) return { balance: 0, nodes: [] };
        if (!r.ok) return Promise.reject(new Error("bad"));
        return r.json();
      })
      .then((d) => {
        if (!ignore) setData(d);
      })
      .catch(() => {
        if (!ignore) setError("Could not load your nodes.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { balance, nodes } = data;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My nodes</h1>
        <p className="text-sm text-muted-foreground">
          Balance: <span className="font-medium text-foreground">{balance.toFixed(2)}</span>
        </p>
      </header>

      {nodes.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">You don&apos;t own any nodes yet.</p>
          <Link href="/nodes/purchase">
            <Button className="h-10 w-full">Purchase a node</Button>
          </Link>
        </div>
      ) : (
        nodes.map((n) => (
          <Card key={n.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Tier {n.tier_code} · {n.tier_name}
                </CardTitle>
                <Badge variant={n.status === "available" ? "outline" : "secondary"}>
                  {n.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specs</span>
                <span>
                  {n.vcpu} vCPU · {n.ram_gb} GB · {n.gpu} GPU · {n.bandwidth} Gbps
                </span>
              </div>
              {n.assignment && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job</span>
                  <span className="text-right">
                    <Link
                      href={`/marketplace/${n.assignment.job_id}`}
                      className="underline underline-offset-4"
                    >
                      {n.assignment.company}
                    </Link>{" "}
                    · ≈ {n.assignment.estimated_earnings.toFixed(2)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Link href="/marketplace">
        <Button variant="outline" className="h-10 w-full">
          Browse marketplace
        </Button>
      </Link>
    </div>
  );
}
