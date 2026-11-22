import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { titleFromHref, wikilinksToMarkdown } from "@/features/notes/wikilinks";

interface MarkdownProps {
  content: string;
  /** Called with a [[link]]'s target title when it's clicked. */
  onOpenLink?: (title: string) => void;
  /** Lower-cased titles of notes that exist; links to others render as "missing". */
  existingTitles?: Set<string>;
  className?: string;
}

/**
 * Renders a note's markdown (GitHub-flavoured: tables, task lists,
 * strikethrough, autolinks). Raw HTML in notes is shown as text, never
 * rendered, so a note can't inject markup.
 */
export const Markdown = memo(function Markdown({
  content,
  onOpenLink,
  existingTitles,
  className,
}: MarkdownProps) {
  const components: Components = {
    a: ({ href, children }) => {
      const title = titleFromHref(href);
      if (title !== null) {
        const missing = existingTitles && !existingTitles.has(title.trim().toLowerCase());
        return (
          <button
            type="button"
            className={cn("wikilink", missing && "wikilink-missing")}
            title={missing ? `Create "${title}"` : `Open "${title}"`}
            onClick={() => onOpenLink?.(title)}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    // Task-list checkboxes are display-only.
    input: (props) => <input {...props} disabled />,
  };

  return (
    <div className={cn("note-prose", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {wikilinksToMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
