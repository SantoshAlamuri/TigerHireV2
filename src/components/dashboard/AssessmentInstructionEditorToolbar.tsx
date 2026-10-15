"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

const btn =
  "rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] disabled:opacity-40";
const active = "bg-[var(--accent-muted)] text-[var(--accent)]";

export function AssessmentInstructionEditorToolbar({
  editor,
  ariaLabel = "Assessment rich text formatting",
}: {
  editor: Editor;
  ariaLabel?: string;
}) {
  useEditorState({
    editor,
    selector: (snap) => snap.transactionNumber,
  });

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (candidate opens in new tab)", previous ?? "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  }

  return (
    <div
      className="sticky top-0 z-[1] flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg)]/95 px-1 py-1 backdrop-blur-sm sm:px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("bold") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("italic") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("underline") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <Underline size={16} />
      </button>
      <span
        className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:inline-block"
        aria-hidden
      />
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("heading", { level: 2 }) ? active : ""}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Section heading"
      >
        <Heading2 size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("heading", { level: 3 }) ? active : ""}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Subheading"
      >
        <Heading3 size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("blockquote") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <Quote size={16} />
      </button>
      <span
        className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:inline-block"
        aria-hidden
      />
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("bulletList") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bulleted list"
      >
        <List size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0 ${editor.isActive("orderedList") ? active : ""}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered size={16} />
      </button>
      <span
        className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:inline-block"
        aria-hidden
      />
      <button
        type="button"
        className={`${btn} shrink-0`}
        onClick={() => void setLink()}
        title="Insert link"
      >
        <Link2 size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0`}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <Minus size={16} />
      </button>
      <span
        className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:inline-block"
        aria-hidden
      />
      <button
        type="button"
        className={`${btn} shrink-0`}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className={`${btn} shrink-0`}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}
