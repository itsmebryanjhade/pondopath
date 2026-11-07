"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dragHasFiles, fileKind, firstFile } from "@/lib/domain/add-records";
import { setPendingFile } from "@/lib/ui/pending-file";
import { PENDING_FILE_EVENT } from "@/lib/ui/pending-file-event";
import { useToast } from "./toast-host";

/** Drag enters and leaves fire for every child element, so a counter tells when the file really left the window. */
export function nextDragDepth(depth: number, event: "enter" | "leave" | "drop"): number {
  if (event === "drop") return 0;
  return event === "enter" ? depth + 1 : Math.max(0, depth - 1);
}

/** Drag an Excel or CSV file over any workspace page to open it on the Add records page. */
export function FileDropOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);
  const onAddPage = pathname === "/add";

  useEffect(() => {
    const isFileDrag = (event: DragEvent) => !!event.dataTransfer && dragHasFiles(Array.from(event.dataTransfer.types));
    const enter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth.current = nextDragDepth(depth.current, "enter");
      setVisible(true);
    };
    const over = (event: DragEvent) => { if (isFileDrag(event)) event.preventDefault(); };
    const leave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth.current = nextDragDepth(depth.current, "leave");
      if (!depth.current) setVisible(false);
    };
    const drop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      // The Add records drop area handles its own drops (it calls preventDefault first).
      const handledByDropArea = event.defaultPrevented && event.target instanceof Element && !!event.target.closest(".add-drop");
      event.preventDefault();
      depth.current = nextDragDepth(depth.current, "drop");
      setVisible(false);
      if (handledByDropArea) return;
      const file = firstFile(event.dataTransfer?.files);
      if (!file) return;
      if (!fileKind(file.name)) { toast.show("Only Excel (.xlsx) and CSV files.", undefined, "notice"); return; }
      setPendingFile(file);
      if (onAddPage) window.dispatchEvent(new Event(PENDING_FILE_EVENT));
      else router.push("/add");
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onAddPage, router, toast]);

  // On the Add records page the drop area itself lights up instead.
  if (!visible || onAddPage) return null;
  return (
    <div className="add-overlay" aria-hidden="true">
      <div className="add-overlay-box"><strong>Drop to import</strong><span>Excel or CSV files only</span></div>
    </div>
  );
}
