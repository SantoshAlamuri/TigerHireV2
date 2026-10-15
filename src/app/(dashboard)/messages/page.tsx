"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Send, MessageCircle, Plus, X, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useApiMutation, useOptimisticMutation } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Message, Conversation } from "@/types";

interface ParticipantOption {
  id: string;
  name: string;
  type: "member" | "candidate";
}

const CONVERSATION_ID_PARAM_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ConversationListItem({
  conversation,
  isSelected,
  currentUserId,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  // Prefer the API-resolved participant name; fall back to the other participant
  // in the resolved list, then to a neutral label (never a raw UUID).
  const otherParticipant = conversation.participants?.find((p) => p.id !== currentUserId);
  const displayName =
    conversation.display_name?.trim() || otherParticipant?.name?.trim() || "Unknown";
  const initials = getInitials(displayName);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition p-4 ${
        isSelected
          ? "card-lifted border-[var(--accent)] alive-halo"
          : "card-lifted-hover border-[var(--border)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] text-sm font-semibold text-[var(--accent)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="heading-card truncate text-sm text-[var(--text)]">{displayName}</p>
            {conversation.unread_count > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-black">
                {conversation.unread_count}
              </span>
            )}
          </div>
          {conversation.last_message && (
            <>
              <p className="text-body mt-1 truncate text-xs text-white/60">
                {conversation.last_message.body}
              </p>
              <p className="text-body mt-1 text-xs text-white/60">
                {formatTime(conversation.last_message.created_at)}
              </p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`card-lifted max-w-[75%] rounded-xl px-4 py-2.5 ${
          isOwn
            ? "border-transparent bg-[var(--accent)] text-black"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
        }`}
      >
        <p className="text-body text-sm whitespace-pre-wrap break-words">{message.body}</p>
        {message.attachment_url && (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-xs underline"
          >
            {message.attachment_name || "Attachment"}
          </a>
        )}
        <p className={`text-body mt-1.5 text-xs ${isOwn ? "text-black/60" : "text-white/60"}`}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

function NewConversationModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
  submitError,
  members,
  candidates,
  currentUserId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (participantIds: string[], subject: string, message: string) => Promise<boolean>;
  loading: boolean;
  submitError: string | null;
  members: Array<{
    user_id?: string;
    id?: string;
    full_name: string;
    role: string;
  }>;
  candidates: Array<{
    id: string;
    name?: string;
    full_name?: string;
    user_id?: string | null;
  }>;
  currentUserId: string;
}) {
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const memberOptions: ParticipantOption[] = (members ?? [])
    .filter((m) => {
      const id = (m.user_id ?? m.id) as string;
      return id && id !== currentUserId;
    })
    .map((m) => ({
      id: (m.user_id ?? m.id) as string,
      name: m.full_name ?? "Unknown",
      type: "member" as const,
    }));

  /** conversation_participants.user_id must be auth.users.id, not candidates.id */
  const candidateOptions: ParticipantOption[] = (candidates ?? [])
    .filter((c) => typeof c.user_id === "string" && c.user_id.length > 0)
    .map((c) => ({
      id: c.user_id as string,
      name: c.name ?? c.full_name ?? "Candidate",
      type: "candidate" as const,
    }));

  const allOptions = [...memberOptions, ...candidateOptions];
  const selectedIds = new Set(participants.map((p) => p.id));
  const searchLower = search.trim().toLowerCase();
  const filteredOptions = searchLower
    ? allOptions.filter((o) => !selectedIds.has(o.id) && o.name.toLowerCase().includes(searchLower))
    : allOptions.filter((o) => !selectedIds.has(o.id));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const addParticipant = (p: ParticipantOption) => {
    setParticipants((prev) => [...prev, p]);
    setSearch("");
    setShowDropdown(false);
    searchInputRef.current?.focus();
  };

  const removeParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const resetForm = () => {
    setParticipants([]);
    setSearch("");
    setSubject("");
    setMessage("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (participants.length === 0 || !message.trim() || loading) return;
    const ok = await onSubmit(
      participants.map((p) => p.id),
      subject.trim(),
      message.trim(),
    );
    if (ok) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="relative w-full max-w-lg card-lifted p-6">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-white/60 transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <h2 className="heading-card mb-4 pr-8 text-lg text-[var(--text)]">New Conversation</h2>
        {submitError && (
          <p className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {submitError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">
              Participants
            </label>
            {participants.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] px-2 py-0.5 text-xs text-[var(--accent)]"
                  >
                    {p.name}
                    <button
                      type="button"
                      onClick={() => removeParticipant(p.id)}
                      className="rounded p-0.5 transition hover:bg-[var(--accent)]/20"
                      aria-label={`Remove ${p.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search team or candidates with an account…"
                className="w-full rounded-xl border border-[var(--border-interactive)] bg-[var(--bg)] pl-9 pr-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {showDropdown && filteredOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                  {filteredOptions.map((o) => (
                    <button
                      key={`${o.type}-${o.id}`}
                      type="button"
                      onClick={() => addParticipant(o)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text)] transition hover:bg-white/[0.04]"
                    >
                      {o.name}
                      <span className="text-xs text-white/60">
                        {o.type === "member" ? "Team" : "Candidate"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">
              Subject (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              className="w-full rounded-xl border border-[var(--border-interactive)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full min-h-[100px] resize-none rounded-xl border border-[var(--border-interactive)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/20"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-[var(--border-interactive)] bg-[var(--bg)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={participants.length === 0 || !message.trim() || loading}
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessagesPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const cParam = searchParams.get("c");
  const fromQuery = cParam && CONVERSATION_ID_PARAM_RE.test(cParam) ? cParam : null;
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(fromQuery);
  const [showCompose, setShowCompose] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    data: conversationsData,
    loading: conversationsLoading,
    refetch: refetchConversations,
  } = useApiQuery<{ conversations: Conversation[] }>("/api/messages");
  const conversations = conversationsData?.conversations || [];

  const {
    data: messagesResponse,
    loading: messagesLoading,
    refetch: refetchMessagesQuery,
  } = useApiQuery<{ messages: Message[] }>(
    selectedConversationId ? `/api/messages/${selectedConversationId}` : null,
  );
  const messages = messagesResponse?.messages ?? [];
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  const { data: membersData } = useApiQuery<{
    members: Array<{
      user_id?: string;
      id?: string;
      full_name: string;
      role: string;
    }>;
    pendingInvites?: unknown[];
  }>(showCompose ? "/api/organisations/members" : null);
  const { data: candidatesData } = useApiQuery<{
    candidates: Array<{
      id: string;
      name?: string;
      full_name?: string;
      user_id?: string | null;
    }>;
    pagination?: unknown;
  }>(showCompose ? "/api/candidates" : null);
  const members = membersData?.members ?? [];
  const candidates = candidatesData?.candidates ?? [];

  const { mutate: sendMessage, loading: sendingMessage } = useOptimisticMutation<
    { message: Message },
    { body: string }
  >(selectedConversationId ? `/api/messages/${selectedConversationId}` : "", {
    method: "POST",
    onMutate: (variables) => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        conversation_id: selectedConversationId ?? "",
        sender_id: user?.id ?? "",
        body: variables.body,
        attachment_url: null,
        attachment_name: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      setOptimisticMessages((prev) => [...prev, optimisticMessage]);
      return () => {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      };
    },
    onSuccess: (response, variables) => {
      setOptimisticMessages((prev) => {
        const index = prev.findIndex(
          (m) => m.body === variables.body && m.id.startsWith("optimistic-"),
        );
        if (index === -1) return prev;
        const next = [...prev];
        next[index] = response.message;
        return next;
      });
      void refetchConversations();
    },
    onError: (err) => {
      toast({
        title: "Message not sent",
        description: err.message,
        tone: "error",
      });
    },
  });

  const {
    mutate: createConversation,
    loading: composeSending,
    error: composeError,
  } = useApiMutation<
    {
      participant_ids: string[];
      subject?: string;
      job_id?: string;
      message: string;
    },
    { conversation: Conversation; message: Message }
  >("/api/messages", "POST");

  // Poll for new conversations/replies so the thread updates without a manual
  // refresh. Silent refetch avoids spinners; skip while the tab is hidden.
  useEffect(() => {
    const POLL_MS = 20_000;
    const tick = () => {
      if (document.hidden) return;
      void refetchConversations({ silent: true });
      if (selectedConversationId) void refetchMessagesQuery({ silent: true });
    };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refetchConversations, refetchMessagesQuery, selectedConversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages]);

  useEffect(() => {
    setOptimisticMessages(messages);
  }, [messages]);

  const handleSendMessage = async () => {
    if (!selectedConversationId || !messageBody.trim() || sendingMessage) return;
    const outgoing = messageBody.trim();
    setMessageBody("");
    const result = await sendMessage({ body: outgoing });
    if (!result) {
      setMessageBody(outgoing);
      void refetchMessagesQuery({ silent: true });
    }
  };

  const handleCreateConversation = async (
    participantIds: string[],
    subject: string,
    message: string,
  ): Promise<boolean> => {
    const result = await createConversation({
      participant_ids: participantIds,
      subject: subject || undefined,
      message,
    });
    if (result?.conversation) {
      setSelectedConversationId(result.conversation.id);
      void refetchConversations();
      void refetchMessagesQuery();
      return true;
    }
    return false;
  };

  const handleComposeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  if (!user) {
    return (
      <>
        <PageHeader title="Messages" />
        <div className="space-y-3 py-6">
          <Skeleton className="h-12 w-64" />
          <div className="card-lifted h-[60vh] p-4">
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-4/5 rounded-xl" />
              <Skeleton className="h-16 w-3/4 rounded-xl" />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="In-app messaging" />
      <div className="card-lifted flex h-[calc(100vh-10rem)] max-h-[800px] gap-4 overflow-hidden rounded-[28px] border border-[var(--border)]">
        {/* Conversation List */}
        <div className="w-80 shrink-0 border-r border-[var(--border)] flex flex-col">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="heading-card text-lg text-[var(--text)]">Conversations</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <button
              onClick={() => setShowCompose(true)}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              <Plus size={16} />
              New Conversation
            </button>
            {conversationsLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={`conv-skel-${idx}`} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-white/60">
                  <MessageCircle size={32} />
                </div>
                <h3 className="heading-card text-lg text-[var(--text)]">No conversations</h3>
                <p className="text-body mt-2 text-sm text-white/60">
                  Start a new conversation to get started
                </p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === selectedConversationId}
                  currentUserId={user.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col">
          {selectedConversationId ? (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messagesLoading ? (
                  <div className="space-y-3 py-4">
                    <Skeleton className="ml-auto h-16 w-2/3 rounded-xl" />
                    <Skeleton className="h-16 w-3/4 rounded-xl" />
                    <Skeleton className="ml-auto h-20 w-1/2 rounded-xl" />
                  </div>
                ) : optimisticMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-white/60">
                      <MessageCircle size={32} />
                    </div>
                    <h3 className="heading-card text-lg text-[var(--text)]">No messages yet</h3>
                    <p className="text-body mt-2 text-sm text-white/60">
                      Start the conversation by sending a message
                    </p>
                  </div>
                ) : (
                  <>
                    {optimisticMessages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isOwn={message.sender_id === user.id}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Compose Area */}
              <div className="border-t border-[var(--border)] p-4">
                <div className="flex gap-3">
                  <textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    onKeyDown={handleComposeKeyDown}
                    placeholder="Type a message..."
                    rows={2}
                    className="flex-1 rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] transition focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageBody.trim() || sendingMessage}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingMessage ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-white/60">
                  <MessageCircle size={32} />
                </div>
                <h3 className="heading-card text-lg text-[var(--text)]">Select a conversation</h3>
                <p className="text-body mt-2 text-sm text-white/60">
                  Choose a conversation from the list to view messages
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewConversationModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        onSubmit={handleCreateConversation}
        loading={composeSending}
        submitError={composeError}
        members={members}
        candidates={candidates}
        currentUserId={user.id}
      />
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Messages" subtitle="In-app messaging" />
          <div className="space-y-3 py-6">
            <Skeleton className="h-12 w-72" />
            <div className="card-lifted h-[60vh] p-4">
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-5/6 rounded-xl" />
                <Skeleton className="h-16 w-2/3 rounded-xl" />
              </div>
            </div>
          </div>
        </>
      }
    >
      <MessagesPageInner />
    </Suspense>
  );
}
