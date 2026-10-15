import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";

/** TipTap stack for the org offer letter template (merge tokens preserved in HTML). */
export function getOfferLetterTemplateExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: "font-medium text-[var(--accent)] underline underline-offset-2 hover:opacity-90",
      },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Placeholder.configure({
      placeholder:
        "Start your letter… Use merge tokens like {{candidate_name}} from the table beside the editor.",
    }),
    Highlight.configure({
      multicolor: false,
      HTMLAttributes: { class: "rounded-sm bg-amber-500/25 px-0.5 text-[var(--text)]" },
    }),
  ];
}
