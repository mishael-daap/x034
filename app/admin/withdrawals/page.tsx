import { redirect } from "next/navigation";

/** Legacy URL — the withdrawal review queue now lives at /admin/transactions. */
export default function AdminWithdrawalsRedirect() {
  redirect("/admin/transactions");
}
