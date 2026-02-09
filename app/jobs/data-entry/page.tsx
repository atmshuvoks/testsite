import { redirect } from "next/navigation";

// Dedicated entry-point URL for "Data entry jobs".
export default function DataEntryJobsPage() {
  redirect("/jobs?dataEntryOnly=1");
}

