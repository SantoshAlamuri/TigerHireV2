"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { OfferLetterEditorToolbar } from "@/components/settings/OfferLetterEditorToolbar";
import { getOfferLetterTemplateExtensions } from "@/lib/offers/offer-letter-editor-extensions";

function escapeForHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Legacy plain-text templates → simple HTML for TipTap. Already-HTML bodies pass through. */
function legacyPlainTemplateToHtml(body: string): string {
  const t = body.trim();
  if (!t) return "<p></p>";
  if (/<\/?[a-z][\s\S]*?>/i.test(t)) return body;
  return t
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeForHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Props = {
  hydrateKey: string;
  initialBody: string;
  onHtmlChange: (html: string) => void;
};

export function OfferLetterTemplateRichEditor({ hydrateKey, initialBody, onHtmlChange }: Props) {
  const initialBodyRef = useRef(initialBody);

  useEffect(() => {
    initialBodyRef.current = initialBody;
  }, [initialBody]);

  const editor = useEditor({
    extensions: getOfferLetterTemplateExtensions(),
    content: legacyPlainTemplateToHtml(initialBody),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "offer-letter-editor focus:outline-none min-h-[320px] max-w-none px-3 py-3 text-sm leading-relaxed text-[var(--text)] " +
          "[&_p]:my-1.5 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-[var(--text-muted)] [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] " +
          "[&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:tracking-tight " +
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)]/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--text-muted)] " +
          "[&_code]:rounded-md [&_code]:bg-[var(--bg-elevated)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] " +
          "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[var(--bg-elevated)] [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] " +
          "[&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--border)] " +
          "[&_a]:cursor-text",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const html = legacyPlainTemplateToHtml(initialBodyRef.current);
    editor.commands.setContent(html, { emitUpdate: false });
    onHtmlChange(html);
  }, [editor, hydrateKey, onHtmlChange]);

  if (!editor) {
    return (
      <div className="min-h-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-sm ring-1 ring-[var(--border)]/60">
      <OfferLetterEditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
