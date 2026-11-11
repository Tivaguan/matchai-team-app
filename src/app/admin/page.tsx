"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The backoffice home opens on today.
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/cash");
  }, [router]);
  return null;
}
