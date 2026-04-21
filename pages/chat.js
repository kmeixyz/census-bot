// pages/chat.js — Ask Question: Claude-powered Census chatbot
import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import SiteLayout from "../components/SiteLayout";
import styles from "../styles/Chat.module.css";

const SUGGESTIONS = [
  "What's the median rent in Chicago, Illinois?",
  "Compare population of Austin and Dallas, Texas.",
  "What is the poverty rate in Detroit, Michigan?",
  "What does ACS 5-year data mean?",
  "Median household income in Seattle, Washington?",
  "Unemployment rate in Miami, Florida?",
];

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BotAvatar() {
  return (
    <div className={`${styles.avatar} ${styles.avatarAssistant}`} aria-hidden>🤖</div>
  );
}

function UserAvatar() {
  return (
    <div className={`${styles.avatar} ${styles.avatarUser}`} aria-hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className={styles.typingRow}>
      <BotAvatar />
      <div className={styles.typingBubble}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}

export default function ChatPage() {
  // messages shape: { role: "user" | "assistant", content: string, error?: boolean }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const MAX_EXCHANGES = 10; // 10 user + 10 assistant = 20 messages

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;
    if (messages.length >= MAX_EXCHANGES * 2) return;

    const userMessage = { role: "user", content: trimmed };
    // Keep last 10 exchanges (20 messages) before appending the new one
    const trimmed = messages.slice(-19);
    const newMessages = [...trimmed, userMessage];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build the history for the API — only role + content
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong. Please try again.", error: true },
        ]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Network error — please check your connection and try again.", error: true },
      ]);
    } finally {
      setLoading(false);
      // Re-focus textarea after response
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, messages, loading]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }

  return (
    <>
      <Head>
        <title>CensusBot — Ask Question</title>
        <meta name="description" content="Ask plain-English questions about U.S. Census ACS data." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <SiteLayout>
        <div className={styles.chatPage}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <h1 className={styles.title}>Ask a Question</h1>
              <p className={styles.subtitle}>
                Ask anything about U.S. Census data — I&apos;ll look up live numbers for you.
              </p>
            </div>
            {messages.length > 0 && (
              <button type="button" className={styles.clearBtn} onClick={clearChat}>
                Clear chat
              </button>
            )}
          </div>

          {/* Limit notice */}
          <div className={styles.limitNotice}>
            💬 Conversations are limited to 10 exchanges. Start a new chat anytime by clicking <strong>Clear chat</strong>.
          </div>

          {/* Message list / empty state */}
          {messages.length === 0 && !loading ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <p className={styles.emptyText}>
                Ask me about income, rent, population, poverty rates, and more for any U.S. city.
              </p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.messageList} ref={listRef}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`${styles.messageRow} ${msg.role === "user" ? styles.messageRowUser : ""}`}
                >
                  {msg.role === "assistant" ? <BotAvatar /> : <UserAvatar />}
                  <div
                    className={`${styles.bubble} ${
                      msg.role === "user"
                        ? styles.bubbleUser
                        : msg.error
                        ? `${styles.bubbleAssistant} ${styles.bubbleError}`
                        : styles.bubbleAssistant
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && <TypingIndicator />}
            </div>
          )}

          {/* Input area */}
          <div className={styles.inputArea}>
            {messages.length >= MAX_EXCHANGES * 2 ? (
              <div className={styles.limitReached}>
                Conversation limit reached (10 exchanges). Click <strong>Clear chat</strong> to start a new one.
              </div>
            ) : (
              <>
                <div className={styles.inputRow}>
                  <textarea
                    ref={textareaRef}
                    className={styles.textarea}
                    placeholder="Ask about any U.S. city or Census metric…"
                    value={input}
                    rows={1}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    aria-label="Chat input"
                  />
                  <button
                    type="button"
                    className={styles.sendBtn}
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    aria-label="Send message"
                  >
                    <SendIcon />
                  </button>
                </div>
                <p className={styles.inputHint}>Press Enter to send · Shift+Enter for new line</p>
              </>
            )}
          </div>
        </div>
      </SiteLayout>
    </>
  );
}
