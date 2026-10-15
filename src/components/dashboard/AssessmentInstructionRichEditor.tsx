"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { AssessmentInstructionEditorToolbar } from "@/components/dashboard/AssessmentInstructionEditorToolbar";
import { getAssessmentInstructionEditorExtensions } from "@/lib/assessments/instruction-editor-extensions";

/** Escape plaintext for inserting into TipTap-loaded HTML blobs. */
export function escapeInstructionPlainText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Older plain-text content → paragraphs for TipTap. Strings that look like HTML pass through. */
export function legacyInstructionTextToHtml(body: string): string {
  const t = body.trim();
  if (!t) return "<p></p>";
  if (/<\/?[a-z][\s\S]*?>/i.test(t)) return body;
  return t
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeInstructionPlainText(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Props = {
  hydrateKey: string;
  valueHtml: string;
  onHtmlChange: (html: string) => void;
  placeholder: string;
  minEditorHeightPx?: number;
};

export function AssessmentInstructionRichEditor({
  hydrateKey,
  valueHtml,
  onHtmlChange,
  placeholder,
  minEditorHeightPx = 200,
}: Props) {
  const valueRef = useRef(valueHtml);
  useEffect(() => {
    valueRef.current = valueHtml;
  }, [valueHtml]);

  const editor = useEditor({
    extensions: getAssessmentInstructionEditorExtensions({ placeholder }),
    content: legacyInstructionTextToHtml(valueHtml),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "assessment-instruction-editor focus:outline-none max-w-none px-3 py-3 text-xs leading-relaxed text-[var(--text)] " +
          `[min-height:${minEditorHeightPx}px] ` +
          "[&_p]:my-1.5 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-[var(--text-muted)] [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] " +
          "[&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold " +
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)]/35 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--text-muted)] " +
          "[&_code]:rounded-md [&_code]:bg-[var(--bg-elevated)] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] " +
          "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--border)]",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const html = legacyInstructionTextToHtml(valueRef.current);
    editor.commands.setContent(html, { emitUpdate: false });
    onHtmlChange(html);
    // hydrateKey resets editor when switching template / editing row — intentional.
  }, [editor, hydrateKey, onHtmlChange]);

  if (!editor) {
    return (
      <div
        style={{ minHeight: minEditorHeightPx + 48 }}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-6 text-center text-xs text-[var(--text-muted)]"
      >
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-sm ring-1 ring-[var(--border)]/60">
      <AssessmentInstructionEditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
