import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

/** TipTap for assessment templates and per-assessment instructions (links + basic formatting). */
export function getAssessmentInstructionEditorExtensions(options: { placeholder: string }) {
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
        target: "_blank",
        rel: "noopener noreferrer",
        class: "font-medium text-[var(--accent)] underline underline-offset-2 hover:opacity-90",
      },
    }),
    Placeholder.configure({ placeholder: options.placeholder }),
  ];
}
