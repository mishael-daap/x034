"use client";

import {
  ArrowUpRight,
  CircleDollarSign,
  HandCoins,
  Network,
  Server,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = {
  icon: typeof Server;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Server,
    title: "Own nodes",
    body: "Buy a Tier C, B or A node from the Nodes tab. Each node can take on one paid job at a time.",
  },
  {
    icon: ShoppingBag,
    title: "Commit to marketplace jobs",
    body: "Browse jobs from the Marketplace. Commit a free node whose tier matches the job before it locks.",
  },
  {
    icon: CircleDollarSign,
    title: "Earn from the payout pot",
    body: "Each job's pot is split equally among committed nodes. Earnings land in your wallet when the job completes.",
  },
  {
    icon: Users,
    title: "Grow with referrals",
    body: "Share your referral code. A friend counts once they own a node, and you earn 30% of every node they buy.",
  },
  {
    icon: HandCoins,
    title: "Deposit & withdraw",
    body: "Top up your wallet with test funds or withdraw your balance — requests are reviewed and paid by the platform.",
  },
];

/** Dismissable post-login debrief that explains how the app works. */
export function RulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Network className="size-5 text-primary" />
            Welcome to Compute Marketplace
          </DialogTitle>
          <DialogDescription>
            A quick rundown of the rules so you know exactly how to start earning.
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-0">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3 border-b border-border/60 py-3 last:border-b-0">
                <div className="flex flex-col items-center">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </span>
                  {i < STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-10 w-full"
          >
            <ArrowUpRight />
            Got it — let&apos;s go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
