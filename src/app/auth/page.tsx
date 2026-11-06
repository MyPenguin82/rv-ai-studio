"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const supabase = createClient();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        window.location.href = "/";
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;

        setMessage("Registration successful! Check your email to verify your account.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111] p-8 shadow-2xl"
      >
        <h1 className="mb-2 text-center text-3xl font-bold">
          <span className="text-red-500">RV</span> AI Studio
        </h1>

        <p className="mb-8 text-center text-sm text-gray-400">
          {isLogin ? "Welcome back!" : "Create your account"}
        </p>

        <label className="mb-2 block text-sm">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-5 w-full rounded-lg border border-white/10 bg-black p-3 outline-none focus:border-red-500"
          placeholder="you@example.com"
        />

        <label className="mb-2 block text-sm">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-5 w-full rounded-lg border border-white/10 bg-black p-3 outline-none focus:border-red-500"
          placeholder="At least 6 characters"
        />

        {message && (
          <p className="mb-4 break-words text-sm text-red-400">{message}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-red-600 p-3 font-semibold transition hover:bg-red-700 disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : isLogin
              ? "Login"
              : "Create Account"}
        </button>

        <p className="mt-6 text-center text-sm text-gray-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage("");
            }}
            className="font-semibold text-red-500 hover:text-red-400"
          >
            {isLogin ? "Register" : "Login"}
          </button>
        </p>
      </form>
    </main>
  );
}