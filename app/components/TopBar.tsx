import type { ReactNode } from "react";
import Link from "next/link";

export default function TopBar({
  right,
}: {
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbarInner">
        <Link href="/jobs" className="brand" aria-label="Job portal home">
          <span className="brandMark" aria-hidden="true">
            AJ
          </span>
          <span className="brandText">
            <span className="brandName">AllJobs Mirror</span>
            <span className="brandTag">Local job portal (Teletalk sync)</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="Primary">
          <Link className="topnavLink" href="/jobs">
            All jobs
          </Link>
          <Link className="topnavLink" href="/jobs/computer">
            Computer jobs
          </Link>
          <Link className="topnavLink" href="/jobs/data-entry">
            Data entry
          </Link>
        </nav>
        <div className="topbarRight">{right}</div>
      </div>
    </header>
  );
}
