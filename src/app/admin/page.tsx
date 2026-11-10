"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The backoffice home. Until the day and month views exist, it opens the Cash page.
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/cash");
  }, [router]);
  return null;
}
