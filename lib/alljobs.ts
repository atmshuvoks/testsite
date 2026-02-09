export const ALLJOBS_BASE = "https://alljobs.teletalk.com.bd";

export type GovtJobPublicDetails = {
  id: number;
  job_title: string;
  job_title_bn?: string | null;
  job_id: string;
  job_type: number;
  vacancy: string;
  gender?: number | null;
  min_age?: number | null;
  max_age?: number | null;
  application_site: string;
  advertisement_file?: string | null;
  published_date: string;
  deadline_date: string;
  advertisement_no?: string | null;
  advertisement_published_date?: string | null;
  job_source?: string | null;
  vacancy_not_specific?: boolean | null;
  view_count?: number | null;
  status?: number | null;
  job_utilities_govtorganization?: {
    id: number;
    name: string;
    name_bn?: string | null;
    short_name?: string | null;
    logo?: string | null;
    website?: string | null;
    details?: string | null;
  } | null;
};

type GovtJobPublicDetailsResponse = {
  status: string;
  statusCode: number;
  message?: unknown;
  details?: GovtJobPublicDetails;
};

export function alljobsMediaUrl(filePath: string) {
  return `${ALLJOBS_BASE}/media/${filePath.replace(/^[\\/]+/, "")}`;
}

export async function fetchGovtJobPublicDetails(id: number) {
  const url = new URL(`${ALLJOBS_BASE}/api/v1/govt-jobs/public-details`);
  url.searchParams.set("id", String(id));

  const res = await fetch(url.toString(), {
    headers: {
      "user-agent": "jobmirror-local/1.0",
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Alljobs govt public-details failed: ${res.status} ${res.statusText} ${text}`.slice(
        0,
        400
      )
    );
  }

  const json = (await res.json()) as GovtJobPublicDetailsResponse;
  if (!json || json.statusCode !== 200 || !json.details) {
    throw new Error("Alljobs govt public-details unexpected response");
  }
  return json.details;
}
