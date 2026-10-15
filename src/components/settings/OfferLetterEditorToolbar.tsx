"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";

const btn =
  "rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] disabled:opacity-40";
const active = "bg-[var(--accent-muted)] text-[var(--accent)]";

function Divider() {
  return (
    <span
      className="mx-0.5 hidden h-6 w-px shrink-0 bg-[var(--border)] sm:inline-block"
      aria-hidden
    />
  );
}

export function OfferLetterEditorToolbar({ editor }: { editor: Editor }) {
  useEditorState({
    editor,
    selector: (snap) => snap.transactionNumber,
  });

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", previous ?? "https://");
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
      className="sticky top-0 z-[1] flex flex-col gap-1 border-b border-[var(--border)] bg-[var(--bg)]/95 px-1 py-1.5 backdrop-blur-sm sm:px-2"
      role="toolbar"
      aria-label="Letter formatting"
    >
      <div className="flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("bold") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (⌘B)"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("italic") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (⌘I)"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("underline") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (⌘U)"
        >
          <Underline size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("strike") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("highlight") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("code") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code2 size={16} />
        </button>
        <Divider />
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
        <Divider />
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive("bulletList") ? active : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
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
        <Divider />
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
          title="Horizontal line"
        >
          <Minus size={16} />
        </button>
        <Divider />
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
      <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="mr-1 shrink-0 pl-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
          Align
        </span>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive({ textAlign: "left" }) ? active : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive({ textAlign: "center" }) ? active : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive({ textAlign: "right" }) ? active : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight size={16} />
        </button>
        <button
          type="button"
          className={`${btn} shrink-0 ${editor.isActive({ textAlign: "justify" }) ? active : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          title="Justify"
        >
          <AlignJustify size={16} />
        </button>
      </div>
    </div>
  );
}
