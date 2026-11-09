"use client";

import { useEffect, useRef } from "react";
import { DashboardIcon } from "./dashboard-icon";
import styles from "@/app/auth.module.css";

export function AuthErrorBanner({ id, title, message }: { id?: string; title: string; message: string }) {
  const banner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    banner.current?.focus();
  }, [message]);

  return (
    <div className={styles.error} role="alert" tabIndex={-1} ref={banner}>
      <p className={styles.errorTitle}><DashboardIcon name="alert" size={16} />{title}</p>
      <p id={id}>{message}</p>
    </div>
  );
}
