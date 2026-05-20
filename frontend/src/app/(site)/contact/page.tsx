"use client";

import { useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { NavBackButton } from "@/components/nav-back-button";
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  };

  const inputClass =
    "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white " +
    "placeholder:text-white/25 focus:outline-none focus:border-white/30 focus:bg-white/[0.06] " +
    "transition resize-none";

  return (
    <div className="flex flex-col flex-1 bg-black text-white">
      <SiteNav>
        <NavBackButton />
      </SiteNav>
      <div className="flex-1 max-w-xl mx-auto px-5 py-12 w-full">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Get in touch</h1>
          <p className="mt-2 text-sm text-white/40">
            We read every message. Expect a reply within 24 hours.
          </p>
        </div>

        {status === "success" ? (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Message sent</h2>
            <p className="text-sm text-white/50 mb-6">
              Thanks for reaching out. We&apos;ll get back to you soon.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="text-sm text-white/40 hover:text-white/70 transition underline underline-offset-4"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-white/40 font-medium tracking-wide uppercase">
                  Name
                </label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  disabled={status === "loading"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-white/40 font-medium tracking-wide uppercase">
                  Email
                </label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === "loading"}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/40 font-medium tracking-wide uppercase">
                Subject
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="What's this about?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                maxLength={200}
                disabled={status === "loading"}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/40 font-medium tracking-wide uppercase">
                Message
              </label>
              <textarea
                className={inputClass + " min-h-[160px]"}
                placeholder="Tell us what's on your mind..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={5000}
                disabled={status === "loading"}
              />
              <span className="text-xs text-white/20 text-right">
                {message.length}/5000
              </span>
            </div>

            {status === "error" && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold
                         text-sm rounded-xl py-3.5 hover:bg-white/90 active:scale-[0.98] transition
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send message
                </>
              )}
            </button>
          </form>
        )}
      </div>

    </div>
  );
}
