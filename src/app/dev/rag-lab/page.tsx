import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/actions/user-actions";
import { RagLab } from "./rag-lab-client";

// Burns real embedding-API credits per click, so it never ships to prod.
// Admin-gated on top of that -- the sidebar already hides the link from
// everyone else (see app-sidebar.tsx), but that's just UI; this is the
// real check, since any signed-in user could otherwise type the URL.
export default async function RagLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { user } = await requireCurrentUser();
  if (user.role !== "admin") {
    notFound();
  }

  return <RagLab />;
}
