import { redirect } from "next/navigation";

// Dedicated entry-point URL for "Computer jobs".
// We keep the listing implementation in `/jobs` and apply a filter via querystring.
export default function ComputerJobsPage() {
  redirect("/jobs?computerOnly=1");
}

