"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The backoffice home. Until the day and month views exist, it opens the Employees page.
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/employees");
  }, [router]);
  return null;
}
