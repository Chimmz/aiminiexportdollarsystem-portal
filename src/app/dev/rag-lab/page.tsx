import { notFound } from "next/navigation";
import { RagLab } from "./rag-lab-client";

// Burns real embedding-API credits per click, so it never ships to prod.
export default function RagLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <RagLab />;
}
