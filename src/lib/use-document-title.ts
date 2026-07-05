import { useEffect } from "react";

const APP_NAME = "Kanban. Simple.";

/** Sets the browser tab title, e.g. "My Project · Kanban. Simple." */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
