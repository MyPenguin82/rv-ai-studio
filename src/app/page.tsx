"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "text" | "image" | "video";

type Attachment = {
  id: string;
  file: File;
  preview: string | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  videoUrl?: string;
};

type ChatRecord = {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  expires_at: string;
};

type Plan = {
  name: string;
  price: string;
  credits: string;
};

export default function Home() {
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState("");

  const [duration, setDuration] = useState("2");
  const [size, setSize] = useState("480p");
  const [ratio, setRatio] = useState("16:9");

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState("RV AI Studio User");

  // Modals & Payment State
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("epay");

  // Form Fields for Payment
  const [payEmail, setPayEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expDate, setExpDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");

  const [chatId, setChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadHistory = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setChatHistory([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    const { data, error } = await supabase
      .from("chats")
      .select("id, title, messages, created_at, expires_at")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setHistoryError(error.message);
      setChatHistory([]);
    } else {
      setChatHistory((data || []) as ChatRecord[]);
    }

    setHistoryLoading(false);
  }, [supabase]);

  const loadCredits = useCallback(async () => {
    if (!userId) {
      setCreditBalance(null);
      setCreditsError("");
      return;
    }

    setCreditsLoading(true);
    setCreditsError("");

    try {
      const response = await fetch("/api/credits", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load credits.");
      }

      setCreditBalance(Number(data.balance));
    } catch (error) {
      setCreditBalance(null);
      setCreditsError(
        error instanceof Error ? error.message : "Could not load credits."
      );
    } finally {
      setCreditsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void loadCredits();
    } else {
      setCreditBalance(null);
      setCreditsError("");
    }
  }, [userId, loadCredits]);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      const user = error ? null : data.user;

      setUserEmail(user?.email ?? null);
      if (user?.email) setPayEmail(user.email);
      setUserId(user?.id ?? null);
      setAuthLoading(false);

      if (user) {
        await loadHistory();
      } else {
        setChatHistory([]);
        setChatId(null);
        setMessages([]);
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      const user = session?.user ?? null;

      setUserEmail(user?.email ?? null);
      if (user?.email) setPayEmail(user.email);
      setUserId(user?.id ?? null);

      if (!user) {
        setChatHistory([]);
        setChatId(null);
        setMessages([]);
      } else {
        window.setTimeout(() => {
          if (mounted) void loadHistory();
        }, 0);
      }

      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadHistory]);

  useEffect(() => {
    return () => {
      attachments.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    };
  }, [attachments]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }));

    setAttachments((previous) => [...previous, ...newAttachments]);
  };

  const removeFile = (id: string) => {
    setAttachments((previous) => {
      const item = previous.find((file) => file.id === id);

      if (item?.preview) URL.revokeObjectURL(item.preview);

      return previous.filter((file) => file.id !== id);
    });
  };

  function startNewChat() {
    setChatId(null);
    setMessages([]);
    setPrompt("");
    setAttachments([]);
    setProfileOpen(false);
    setHistoryError("");
  }

  function openChat(chat: ChatRecord) {
    setChatId(chat.id);
    setMessages(Array.isArray(chat.messages) ? chat.messages : []);
    setPrompt("");
    setAttachments([]);
    setMode("text");
    setHistoryError("");
  }

  async function saveChat(
    updatedMessages: Message[],
    existingChatId: string | null
  ) {
    if (!userId) return;

    const firstUserMessage = updatedMessages.find(
      (message) => message.role === "user"
    );

    const title = firstUserMessage?.content.slice(0, 60) || "New chat";

    if (existingChatId) {
      const { error } = await supabase
        .from("chats")
        .update({ messages: updatedMessages })
        .eq("id", existingChatId)
        .eq("user_id", userId);

      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("chats")
        .insert({
          user_id: userId,
          title,
          messages: updatedMessages,
        })
        .select("id")
        .single();

      if (error) throw error;

      setChatId(data.id);
    }

    await loadHistory();
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(error.message);
      return;
    }

    setProfileOpen(false);
    setUserEmail(null);
    setUserId(null);
    setChatId(null);
    setMessages([]);
    setChatHistory([]);

    window.location.href = "/";
  }

  function handleSelectPlan(plan: Plan) {
    setSelectedPlan(plan);
    setPlansModalOpen(false);
    setPaymentModalOpen(true);
  }

  function handleCompletePayment(e: React.FormEvent) {
    e.preventDefault();
    if (paymentMethod === "epay" || paymentMethod === "card") {
      if (!cardNumber || !expDate || !cvv) {
        alert("Sothik card details ar CVV input din.");
        return;
      }
    } else {
      if (!mobileNumber) {
        alert("Mobile banking number-ti input din.");
        return;
      }
    }

    alert(`Subscription Success! Plan: ${selectedPlan?.name}`);
    setPaymentModalOpen(false);
    setCardNumber("");
    setExpDate("");
    setCvv("");
    setMobileNumber("");
  }

  async function handleSend() {
    if (!prompt.trim() || sending) return;

    if (!userId) {
      alert("Please login first.");
      return;
    }

    const userPrompt = prompt.trim();

    if (mode === "image") {
      if (attachments.length > 0) {
        alert("Image upload is not supported in Image Generation yet.");
        return;
      }

      const userMessage: Message = {
        role: "user",
        content: userPrompt,
      };

      setMessages([
        ...messages,
        userMessage,
        {
          role: "assistant",
          content: "Generating your image...",
        },
      ]);

      setPrompt("");
      setSending(true);
      setHistoryError("");

      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Image generation failed.");
        }

        if (typeof data.image !== "string" || !data.image) {
          throw new Error("No generated image received.");
        }

        const completedMessages: Message[] = [
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: "Your image is ready!",
            imageUrl: data.image,
          },
        ];

        setMessages(completedMessages);

        const savedMessages: Message[] = [
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: "Image generated successfully. The image is available in the original session.",
          },
        ];

        try {
          await saveChat(savedMessages, chatId);
        } catch (error) {
          setHistoryError(
            error instanceof Error
              ? `Image created, but history saving failed: ${error.message}`
              : "Image created, but history saving failed."
          );
        }
      } catch (error) {
        setMessages([
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: `Image generation failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ]);
      } finally {
        setSending(false);
        void loadCredits();
      }

      return;
    }

    if (mode === "video") {
      if (attachments.length > 0) {
        alert("Image-to-video is not connected yet. Please remove attachments.");
        return;
      }

      const userMessage: Message = {
        role: "user",
        content: userPrompt,
      };

      setMessages([
        ...messages,
        userMessage,
        {
          role: "assistant",
          content: "Your video is being generated. This may take several minutes...",
        },
      ]);

      setPrompt("");
      setSending(true);
      setHistoryError("");

      let width = 768;
      let height = 512;

      if (ratio === "9:16") {
        width = 512;
        height = 768;
      } else if (ratio === "1:1") {
        width = 512;
        height = 512;
      }

      if (size === "720p") {
        if (ratio === "16:9") {
          width = 1152;
          height = 768;
        } else if (ratio === "9:16") {
          width = 768;
          height = 1152;
        } else {
          width = 768;
          height = 768;
        }
      }

      try {
        const response = await fetch("/api/vedio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: userPrompt,
            duration: Number(duration),
            width,
            height,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Video generation failed.");
        }

        if (
          typeof data.videoUrl !== "string" ||
          !data.videoUrl
        ) {
          throw new Error("No generated video URL received.");
        }

        const completedMessages: Message[] = [
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: "Your video is ready!",
            videoUrl: data.videoUrl,
          },
        ];

        setMessages(completedMessages);

        const savedMessages: Message[] = [
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: "Video generated successfully. The video link may expire, so it is not saved in chat history.",
          },
        ];

        try {
          await saveChat(savedMessages, chatId);
        } catch (error) {
          setHistoryError(
            error instanceof Error
              ? `Video created, but history saving failed: ${error.message}`
              : "Video created, but history saving failed."
          );
        }
      } catch (error) {
        const customErrorMessage = "RV video generator can't generate your video now";

        setMessages([
          ...messages,
          userMessage,
          {
            role: "assistant",
            content: `Video generation failed: ${customErrorMessage}`,
          },
        ]);
      } finally {
        setSending(false);
        void loadCredits();
      }

      return;
    }

    if (attachments.length > 0) {
      alert(
        "File and image analysis will be connected later. Please send text only for now."
      );
      return;
    }

    const conversationMessages: Message[] = [
      ...messages,
      { role: "user", content: userPrompt },
    ];

    const updatedMessages: Message[] = [
      ...conversationMessages,
      { role: "assistant", content: "" },
    ];

    setMessages(updatedMessages);
    setPrompt("");
    setSending(true);
    setHistoryError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "AI response failed.");
      }

      if (!response.body) {
        throw new Error("No response stream received.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMessages = updatedMessages;

      const addToken = (token: string) => {
        finalMessages = finalMessages.map((message, index) =>
          index === finalMessages.length - 1
            ? { ...message, content: message.content + token }
            : message
        );

        setMessages(finalMessages);
      };

      const processLine = (line: string) => {
        if (!line.startsWith("data:")) return;

        const data = line.slice(5).trim();

        if (!data || data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;

          if (typeof token === "string" && token.length > 0) {
            addToken(token);
          }
        } catch {}
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line);
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        processLine(buffer.trim());
      }

      try {
        await saveChat(finalMessages, chatId);
      } catch (error) {
        setHistoryError(
          error instanceof Error
            ? `Response received, but saving failed: ${error.message}`
            : "Response received, but saving failed."
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      setMessages([
        ...updatedMessages.slice(0, -1),
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const acceptTypes =
    mode === "text"
      ? "image/*,.pdf,.doc,.docx,.txt,.csv"
      : "image/*";

  return (
    <main className="flex min-h-screen bg-[#0d0d0d] text-white relative font-sans">
      {/* SIDEBAR */}
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#121212] p-5 md:flex md:flex-col shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0">
            <Image
              src="/logo.png"
              alt="RV Developers Logo"
              width={48}
              height={48}
              className="object-contain"
            />
          </div>
          <h1 className="text-lg font-extrabold tracking-wide text-white">
            <span className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">RV</span> AI STUDIO
          </h1>
        </div>

        <button
          onClick={startNewChat}
          className="mt-8 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold transition hover:border-red-500/40 hover:bg-red-600/10 hover:shadow-[0_0_12px_rgba(239,68,68,0.2)]"
        >
          <span className="text-red-500 font-bold text-lg">+</span> New Chat
        </button>

        <div className="mt-8 min-h-0 flex-1 space-y-4 overflow-y-auto text-sm text-gray-400">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent History</p>

          {!userId && !authLoading && (
            <p className="text-xs text-gray-500">
              Login to save and view your chat history.
            </p>
          )}

          {historyLoading && (
            <p className="text-xs text-gray-500">Loading history...</p>
          )}

          {historyError && (
            <p className="break-words text-xs text-red-400">
              {historyError}
            </p>
          )}

          {userId && !historyLoading && chatHistory.length === 0 && (
            <p className="text-xs text-gray-500">No saved chats yet.</p>
          )}

          {chatHistory.map((chat) => (
            <button
              key={chat.id}
              onClick={() => openChat(chat)}
              className={`block w-full truncate rounded-lg p-2.5 text-left text-xs transition ${
                chatId === chat.id ? "bg-red-600/20 text-white border border-red-500/30 font-medium" : "hover:bg-white/5 text-gray-300"
              }`}
              title={chat.title}
            >
              {chat.title}
            </button>
          ))}
        </div>

        <div className="mt-auto border-t border-white/10 pt-4">
          {userEmail ? (
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left transition hover:bg-white/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 font-bold text-white shadow-md">
                {userEmail.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-xs font-semibold">{userEmail}</span>
            </button>
          ) : (
            <Link
              href="/auth"
              className="block w-full rounded-xl bg-red-600 p-2.5 text-center text-xs font-bold transition hover:bg-red-700 shadow-md"
            >
              Sign In / Login
            </Link>
          )}
        </div>
      </aside>

      {/* MAIN SECTION WITH FIXED LAYOUT */}
      <section className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#121212]/80 backdrop-blur-md p-4 sticky top-0 z-40 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="md:hidden h-10 w-10 relative shrink-0">
              <Image src="/logo.png" alt="Logo" width={40} height={40} className="object-contain" />
            </div>
            <span className="truncate font-bold tracking-tight text-white">RV AI Studio</span>

            {userId && (
              <div className="flex items-center gap-2">
                <div
                  className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-semibold text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.15)]"
                  title={creditsError || "Your current credit balance"}
                >
                  {creditsLoading
                    ? "Loading..."
                    : creditBalance !== null
                      ? `✦ ${creditBalance.toLocaleString()} Credits`
                      : "Credits unavailable"}
                </div>
                <button
                  onClick={() => setPlansModalOpen(true)}
                  className="rounded-full bg-gradient-to-r from-red-600 to-orange-600 px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                >
                  Upgrade Pro
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            {authLoading ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
            ) : userEmail ? (
              <>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  aria-label="Open profile menu"
                  aria-expanded={profileOpen}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 font-bold text-white transition hover:scale-105 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                >
                  {userEmail.charAt(0).toUpperCase()}
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl backdrop-blur-xl">
                    <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-red-600 to-red-800 text-lg font-bold text-white shadow-inner">
                        {userEmail.charAt(0).toUpperCase()}
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#181818] bg-green-500"></span>
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {userEmail}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 border-b border-white/10 pb-4 text-sm">
                      <div className="flex items-center justify-between rounded-xl bg-white/5 p-2.5">
                        <span className="text-gray-400 text-xs">Subscription</span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-500/20 px-2.5 py-0.5 text-xs font-semibold text-gray-300">
                            Free Plan
                          </span>
                          <button
                            onClick={() => {
                              setProfileOpen(false);
                              setPlansModalOpen(true);
                            }}
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700 transition"
                          >
                            Upgrade
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-white/5 p-2.5">
                        <span className="text-gray-400 text-xs">Credits Balance</span>
                        <span className="text-xs font-bold text-yellow-300">
                          ✦ {creditBalance !== null ? creditBalance.toLocaleString() : 0} Credits
                        </span>
                      </div>
                    </div>

                    <div className="py-3">
                      {editProfileOpen ? (
                        <div className="space-y-3 rounded-xl bg-white/5 p-3">
                          <p className="text-xs font-semibold text-white">Edit Profile Name</p>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full rounded-lg bg-[#252525] p-2 text-xs text-white outline-none border border-white/10"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditProfileOpen(false)}
                              className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditProfileOpen(false)}
                              className="flex-1 rounded-lg bg-white/10 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/20"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditProfileOpen(true)}
                          className="w-full rounded-xl bg-white/5 p-2.5 text-left text-xs font-semibold text-gray-200 transition hover:bg-white/10 flex items-center justify-between"
                        >
                          <span>Edit Profile Settings</span>
                          <span>⚙️</span>
                        </button>
                      )}
                    </div>

                    <div className="border-t border-white/10 pt-3">
                      <button
                        onClick={handleLogout}
                        className="w-full rounded-xl bg-red-600 p-2.5 text-sm font-semibold transition hover:bg-red-700 text-white text-center shadow-lg"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Link
                href="/auth"
                className="rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold transition hover:bg-white/5"
              >
                Login
              </Link>
            )}
          </div>
        </header>

        {userId && creditsError && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-center text-xs text-red-300 shrink-0">
            Credit balance: {creditsError}
          </div>
        )}

        {/* SCROLLABLE MESSAGES CONTAINER */}
        <div
          className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center"
          onClick={() => {
            if (profileOpen) setProfileOpen(false);
          }}
        >
          {messages.length === 0 ? (
            <div className="mb-10 mt-6 text-center max-w-xl">
              <div className="mx-auto mb-6 h-28 w-28 relative">
                <Image src="/logo.png" alt="RV Logo" width={112} height={112} className="object-contain" priority />
              </div>
              <h2 className="text-3xl font-extrabold md:text-5xl tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                What will you create today?
              </h2>

              <p className="mt-3 text-sm text-gray-400">
                Experience next-gen AI Chat, Image Creation & Video Generation by RV Developers.
              </p>
            </div>
          ) : (
            <div className="mb-8 w-full max-w-3xl space-y-5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-5 py-4 text-sm ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg"
                        : "border border-white/10 bg-[#181818] text-gray-100 shadow-md"
                    }`}
                  >
                    {message.content && (
                      message.role === "assistant" &&
                      message.content.startsWith("Your video is being generated") &&
                      sending ? (
                        <div className="w-full min-w-[260px] space-y-4 py-2">
                          <div className="flex items-center gap-3">
                            <div className="relative flex h-12 w-12 items-center justify-center">
                              <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />
                              <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/10 border-t-red-500" />
                              <span className="text-red-400 text-lg">✦</span>
                            </div>

                            <div>
                              <h3 className="font-semibold text-white">
                                Generating your video...
                              </h3>
                              <p className="text-xs text-gray-400">
                                LTX-2.5 AI is creating your video
                              </p>
                            </div>
                          </div>

                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div className="h-full w-1/3 animate-[loading_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-red-600 to-orange-400" />
                          </div>

                          <p className="animate-pulse text-xs text-gray-400">
                            Please wait. This may take several minutes...
                          </p>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                      )
                    )}

                    {message.imageUrl && (
                      <div className="mt-3">
                        <img
                          src={message.imageUrl}
                          alt="AI Generated Image"
                          className="w-full rounded-xl border border-white/10"
                        />

                        <a
                          href={message.imageUrl}
                          download="rv-ai-generated-image.jpg"
                          className="mt-3 inline-block rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Download Image ↓
                        </a>
                      </div>
                    )}

                    {message.videoUrl && (
                      <div className="mt-3 w-full">
                        <video
                          src={message.videoUrl}
                          controls
                          playsInline
                          className="max-h-[500px] w-full rounded-xl bg-black border border-white/10"
                        />

                        <a
                          href={message.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open / Download Video ↓
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FIXED INPUT BOX AT BOTTOM */}
        <div
          className="shrink-0 w-full flex flex-col items-center p-4 bg-[#0d0d0d] border-t border-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-3xl rounded-3xl border border-red-500/20 bg-[#161616]/90 p-4 shadow-[0_0_25px_rgba(0,0,0,0.8)] backdrop-blur-md focus-within:border-red-500/50 transition">
            <div className="mb-3 flex flex-wrap gap-2">
              {(["text", "image", "video"] as Mode[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setMode(item)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
                    mode === item
                      ? "bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                mode === "text"
                  ? "Ask anything..."
                  : mode === "image"
                    ? "Describe the image you want to create..."
                    : "Describe the video you want to generate..."
              }
              className="min-h-28 w-full resize-y bg-transparent p-2 text-sm outline-none placeholder:text-gray-500 text-white"
            />

            {attachments.length > 0 && (
              <div className="my-3 flex flex-wrap gap-3">
                {attachments.map((item) => (
                  <div
                    key={item.id}
                    className="flex max-w-52 items-center gap-2 rounded-xl border border-white/10 bg-[#222222] p-2"
                  >
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg">
                        📄
                      </div>
                    )}

                    <span className="max-w-28 truncate text-xs text-gray-300">
                      {item.file.name}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      className="ml-1 text-base text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {mode === "video" && (
              <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
                <label className="text-[11px] text-gray-400">
                  Video Size
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-[#252525] p-2 text-xs text-white border border-white/10 outline-none"
                  >
                    <option value="480p">480p - Standard</option>
                    <option value="720p">720p - High Quality</option>
                  </select>
                </label>

                <label className="text-[11px] text-gray-400">
                  Duration
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-[#252525] p-2 text-xs text-white border border-white/10 outline-none"
                  >
                    <option value="1">1 second</option>
                    <option value="2">2 seconds</option>
                    <option value="3">3 seconds</option>
                    <option value="4">4 seconds</option>
                    <option value="5">5 seconds</option>
                  </select>
                </label>

                <label className="text-[11px] text-gray-400">
                  Ratio
                  <select
                    value={ratio}
                    onChange={(e) => setRatio(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-[#252525] p-2 text-xs text-white border border-white/10 outline-none"
                  >
                    <option>16:9</option>
                    <option>9:16</option>
                    <option>1:1</option>
                  </select>
                </label>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="flex items-center gap-3">
                <label
                  title="Upload files"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-2xl font-light text-white transition hover:border-red-500 hover:bg-red-600/20"
                >
                  +
                  <input
                    type="file"
                    multiple
                    accept={acceptTypes}
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <span className="text-[11px] text-gray-400">
                  {mode === "text"
                    ? "Attach images or files"
                    : mode === "image"
                      ? "Attach an image"
                      : "Text-to-video"}
                </span>
              </div>

              <button
                disabled={!prompt.trim() || sending}
                onClick={() => void handleSend()}
                className="rounded-full bg-gradient-to-r from-red-600 to-red-700 px-5 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-40 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
              >
                {sending
                  ? mode === "image"
                    ? "Generating Image..."
                    : mode === "video"
                      ? "Generating Video..."
                      : "Thinking..."
                  : mode === "text"
                    ? "Send ↑"
                    : mode === "image"
                      ? "Generate Image ↑"
                      : "Generate Video ↑"}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[10px] font-semibold tracking-wider text-gray-500">
            RV DEVELOPERS • POWERING NEXT-GEN AI
          </p>
        </div>
      </section>

      {/* PLANS MODAL */}
      {plansModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#181818] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Upgrade Your Plan</h2>
                <p className="text-xs text-gray-400">Choose the best plan that fits your creative needs.</p>
              </div>
              <button
                onClick={() => setPlansModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20 transition"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              {/* Basic Plan */}
              <div className="flex flex-col rounded-2xl border border-white/10 bg-[#222222] p-5 relative">
                <h3 className="font-bold text-lg text-white">Basic Plan</h3>
                <p className="text-2xl font-extrabold text-red-500 mt-2">$3.99<span className="text-xs font-normal text-gray-400"> /mo</span></p>
                <ul className="mt-4 space-y-2 text-xs text-gray-300 flex-1">
                  <li>✓ No text limit</li>
                  <li>✓ 200 credits</li>
                  <li>✓ Standard generation speed</li>
                </ul>
                <button
                  onClick={() => handleSelectPlan({ name: "Basic Plan", price: "$3.99", credits: "200 Credits" })}
                  className="mt-6 w-full rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition"
                >
                  Choose Basic
                </button>
              </div>

              {/* Pro Plan */}
              <div className="flex flex-col rounded-2xl border-2 border-red-600 bg-[#222222] p-5 relative shadow-xl">
                <span className="absolute -top-3 right-4 rounded-full bg-red-600 px-3 py-0.5 text-[10px] font-bold text-white">Popular</span>
                <h3 className="font-bold text-lg text-white">Pro Plan</h3>
                <p className="text-2xl font-extrabold text-red-500 mt-2">$6.99<span className="text-xs font-normal text-gray-400"> /mo</span></p>
                <ul className="mt-4 space-y-2 text-xs text-gray-300 flex-1">
                  <li>✓ Better text capability</li>
                  <li>✓ Better image creation</li>
                  <li>✓ Better video generation</li>
                  <li>✓ 700 credits</li>
                </ul>
                <button
                  onClick={() => handleSelectPlan({ name: "Pro Plan", price: "$6.99", credits: "700 Credits" })}
                  className="mt-6 w-full rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-700 transition"
                >
                  Choose Pro
                </button>
              </div>

              {/* Ultra Plan */}
              <div className="flex flex-col rounded-2xl border border-white/10 bg-[#222222] p-5 relative">
                <h3 className="font-bold text-lg text-white">Ultra Plan</h3>
                <p className="text-2xl font-extrabold text-red-500 mt-2">$11.99<span className="text-xs font-normal text-gray-400"> /mo</span></p>
                <ul className="mt-4 space-y-2 text-xs text-gray-300 flex-1">
                  <li>✓ 1500 credits</li>
                  <li>✓ Higher text speed</li>
                  <li>✓ Higher image generation speed</li>
                  <li>✓ Higher video generation speed</li>
                  <li>✓ Specific features</li>
                </ul>
                <button
                  onClick={() => handleSelectPlan({ name: "Ultra Plan", price: "$11.99", credits: "1500 Credits" })}
                  className="mt-6 w-full rounded-xl bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition"
                >
                  Choose Ultra
                </button>
              </div>

              {/* RV Plan */}
              <div className="flex flex-col rounded-2xl border border-yellow-500/50 bg-[#222222] p-5 relative">
                <span className="absolute -top-3 right-4 rounded-full bg-yellow-500 px-3 py-0.5 text-[10px] font-bold text-black">Ultimate</span>
                <h3 className="font-bold text-lg text-white">RV Plan</h3>
                <p className="text-2xl font-extrabold text-yellow-400 mt-2">$25.99<span className="text-xs font-normal text-gray-400"> /mo</span></p>
                <ul className="mt-4 space-y-2 text-xs text-gray-300 flex-1">
                  <li>✓ All special features</li>
                  <li>✓ Code generations</li>
                  <li>✓ Video editing</li>
                  <li>✓ 4000 credits</li>
                  <li>✓ All features of Pro, Ultra & Basic</li>
                </ul>
                <button
                  onClick={() => handleSelectPlan({ name: "RV Plan", price: "$25.99", credits: "4000 Credits" })}
                  className="mt-6 w-full rounded-xl bg-yellow-500 py-2.5 text-xs font-semibold text-black hover:bg-yellow-400 transition"
                >
                  Choose RV Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {paymentModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#161616] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>💳 Checkout</span>
                  <span className="text-xs font-normal text-gray-400">({selectedPlan.name})</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">Total: <span className="text-red-500 font-bold">{selectedPlan.price}</span> ({selectedPlan.credits})</p>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCompletePayment} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Payment Gateway</label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("epay")}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center justify-center ${
                      paymentMethod === "epay"
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <span>⚡ e-Pay</span>
                    <span className="text-[9px] font-normal text-gray-400">Card & MFS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bkash")}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center justify-center ${
                      paymentMethod === "bkash"
                        ? "border-pink-500 bg-pink-500/20 text-pink-400"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <span>bKash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("nagad")}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center justify-center ${
                      paymentMethod === "nagad"
                        ? "border-orange-500 bg-orange-500/20 text-orange-400"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <span>Nagad</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition flex flex-col items-center justify-center ${
                      paymentMethod === "card"
                        ? "border-blue-500 bg-blue-500/20 text-blue-400"
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <span>Credit Card</span>
                  </button>
                </div>
              </div>

              {(paymentMethod === "epay" || paymentMethod === "card") && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={payEmail}
                      onChange={(e) => setPayEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#222222] p-2.5 text-xs text-white outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Card Information</label>
                    <div className="mt-1 rounded-xl border border-white/10 bg-[#222222] overflow-hidden">
                      <input
                        type="text"
                        required
                        placeholder="1234 5678 9101 1121"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full border-b border-white/10 bg-transparent p-2.5 text-xs text-white outline-none"
                      />
                      <div className="grid grid-cols-2">
                        <input
                          type="text"
                          required
                          placeholder="MM / YY"
                          value={expDate}
                          onChange={(e) => setExpDate(e.target.value)}
                          className="border-r border-white/10 bg-transparent p-2.5 text-xs text-white outline-none"
                        />
                        <input
                          type="text"
                          required
                          placeholder="CVC / CVV"
                          value={cvv}
                          onChange={(e) => setCvv(e.target.value)}
                          className="bg-transparent p-2.5 text-xs text-white outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Name on Card</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={cardHolderName}
                      onChange={(e) => setCardHolderName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#222222] p-2.5 text-xs text-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              {(paymentMethod === "bkash" || paymentMethod === "nagad") && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">
                      {paymentMethod.toUpperCase()} Account Mobile Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="017XXXXXXXX"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#222222] p-3 text-xs text-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Subscribe & Pay {selectedPlan.price}</span>
                  <span>→</span>
                </button>
              </div>

              <p className="text-[10px] text-center text-gray-500">
                🔒 Encrypted 256-Bit Secure Payment Gateway
              </p>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}