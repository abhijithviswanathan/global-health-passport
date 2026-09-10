"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-state" role="alert">
      <h1>This page could not be displayed.</h1>
      <p>
        Try loading it again. Any changes that were not confirmed may not have
        been saved.
      </p>
      <Button className="primary-button" onClick={reset}>
        Try again
      </Button>
      <Link href="/">Return to Health Passport</Link>
    </main>
  );
}
