"use client";

import { useEffect, useState } from "react";

/**
 * A short message that slides in at the bottom of the screen and leaves on its own.
 * `const toast = useToast()`, then `toast.show("Published")` and render `{toast.node}` once.
 */
export function useToast() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return {
    show: (text: string) => setMessage({ text, id: Date.now() }),
    node: (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-5"
      >
        {message && (
          <p key={message.id} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200 bg-ink px-5 py-3 text-base text-paper shadow-lg">
            {message.text}
          </p>
        )}
      </div>
    ),
  };
}
