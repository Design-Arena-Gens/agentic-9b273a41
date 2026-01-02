"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SmartHomeState } from "@/lib/agent";

type Turn = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  timestamp: string;
};

type AgentResult = {
  reply: string;
  actions: string[];
  state: SmartHomeState;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [command, setCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [latestState, setLatestState] = useState<SmartHomeState | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const interimTranscript = useRef("");
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  const SpeechRecognition = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (
      (window as typeof window & {
        webkitSpeechRecognition?: typeof window.SpeechRecognition;
      }).SpeechRecognition ||
      (window as typeof window & {
        webkitSpeechRecognition?: typeof window.SpeechRecognition;
      }).webkitSpeechRecognition ||
      null
    );
  }, []);

  useEffect(() => {
    if (SpeechRecognition) {
      setVoiceSupported(true);
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ");

        const isFinal = event.results[event.results.length - 1]?.isFinal;
        interimTranscript.current = transcript;
        setCommand(transcript);

        if (isFinal) {
          recognition.stop();
          finalizeCommand(transcript);
        }
      };
      recognition.onerror = (event) => {
        setIsListening(false);
        setVoiceError(event.error);
      };
      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [SpeechRecognition]);

  useEffect(() => {
    const bootstrap = async () => {
      const bootstrapCommand = "give me a status report";
      const introTurn: Turn = {
        id: createId(),
        role: "system",
        text: "Welcome back! I'm ready to help you run the smart home. Tap the microphone or type a request.",
        timestamp: new Date().toISOString(),
      };
      setTurns((existing) => [...existing, introTurn]);
      await sendCommand(bootstrapCommand, true);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!transcriptBoxRef.current) return;
    transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
  }, [turns]);

  const speak = (text: string) => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const finalizeCommand = (transcript: string) => {
    if (!transcript.trim()) return;
    void sendCommand(transcript.trim(), false);
  };

  const sendCommand = async (rawCommand: string, silent = false) => {
    const trimmed = rawCommand.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setVoiceError(null);

    if (!silent) {
      setTurns((existing) => [
        ...existing,
        {
          id: createId(),
          role: "user",
          text: trimmed,
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: trimmed }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = (await response.json()) as AgentResult;
      setLatestState(result.state);
      setTurns((existing) => [
        ...existing,
        {
          id: createId(),
          role: "agent",
          text: result.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
      speak(result.reply);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong, please try again.";
      setTurns((existing) => [
        ...existing,
        {
          id: createId(),
          role: "agent",
          text: `⚠️ ${message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setCommand("");
      interimTranscript.current = "";
      setIsProcessing(false);
    }
  };

  const startListening = () => {
    if (!recognitionRef.current || isProcessing) return;
    setVoiceError(null);
    try {
      recognitionRef.current.abort();
    } catch {
      // ignore
    }
    recognitionRef.current.start();
    setIsListening(true);
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setIsListening(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendCommand(command);
  };

  return (
    <div className="min-h-screen bg-slate-950 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 lg:flex-row">
        <section className="flex-1 space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur">
          <header className="space-y-2">
            <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">
              Aurora Home
            </p>
            <h1 className="text-3xl font-semibold text-white md:text-4xl">
              Voice Agent Control Center
            </h1>
            <p className="max-w-xl text-sm text-slate-300 md:text-base">
              Converse with an autonomous home assistant that understands
              natural language requests for lighting, climate, security, music,
              and reminders. Make a request with your voice or by typing below.
            </p>
          </header>

          <div
            ref={transcriptBoxRef}
            className="flex max-h-[420px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/5 bg-black/30 p-6 shadow-inner"
          >
            {turns.map((turn) => (
              <article
                key={turn.id}
                className={`flex flex-col gap-1 rounded-2xl p-4 ${
                  turn.role === "user"
                    ? "bg-emerald-500/10 text-slate-50"
                    : turn.role === "agent"
                      ? "bg-white/10 text-slate-100"
                      : "bg-slate-700/30 text-slate-200"
                }`}
              >
                <span className="text-xs font-medium uppercase tracking-widest text-emerald-200">
                  {turn.role === "user"
                    ? "You"
                    : turn.role === "agent"
                      ? "Aurora"
                      : "System"}
                </span>
                <p className="text-base leading-relaxed">{turn.text}</p>
                <time className="text-[11px] uppercase tracking-wide text-slate-400">
                  {new Date(turn.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </article>
            ))}
            {turns.length === 0 && (
              <p className="text-sm text-slate-400">
                Say &ldquo;Turn on the living room lights&rdquo; to get
                started.
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 sm:flex-row sm:items-center"
          >
            <div className="flex-1">
              <label
                htmlFor="command"
                className="sr-only"
              >
                Command
              </label>
              <input
                id="command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="Ask me to adjust lights, thermostat, security, music, or reminders…"
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-400/30"
                disabled={isProcessing}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold uppercase tracking-widest text-slate-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProcessing || !command.trim()}
              >
                {isProcessing ? "Processing…" : "Send"}
              </button>
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold uppercase tracking-widest transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 ${
                  isListening
                    ? "bg-rose-500 text-white hover:bg-rose-400"
                    : "bg-white/10 text-slate-100 hover:bg-white/20"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                disabled={!voiceSupported || isProcessing}
              >
                <span className="text-base">{isListening ? "⏹" : "🎙"}</span>
                {isListening ? "Stop" : "Speak"}
              </button>
            </div>
          </form>

          {!voiceSupported && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              Voice recognition is not supported on this browser. You can still
              type commands manually.
            </div>
          )}

          {voiceError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              Voice recognition error: {voiceError}
            </div>
          )}
        </section>

        <aside className="w-full max-w-xl space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur lg:w-[420px]">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">
              Live State
            </p>
            <h2 className="text-2xl font-semibold text-white">
              Smart Home Snapshot
            </h2>
            <p className="text-sm text-slate-300">
              The agent updates this panel after every command so you can track
              what changed.
            </p>
          </header>

          <div className="space-y-4">
            <StateCard title="Lighting">
              {latestState ? (
                <ul className="space-y-2 text-sm text-slate-200">
                  {Object.values(latestState.lights).map((light) => (
                    <li key={light.location} className="flex justify-between">
                      <span className="font-medium text-slate-100">
                        {light.location}
                      </span>
                      <span>
                        {light.on ? "On" : "Off"} · {light.brightness}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Placeholder />
              )}
            </StateCard>

            <StateCard title="Climate">
              {latestState ? (
                <p className="text-sm text-slate-200">
                  {latestState.thermostat.temperature}°F ·{" "}
                  {latestState.thermostat.mode.toUpperCase()}
                </p>
              ) : (
                <Placeholder />
              )}
            </StateCard>

            <StateCard title="Music">
              {latestState ? (
                <p className="text-sm text-slate-200">
                  {latestState.music.playing
                    ? `${latestState.music.track ?? "Playlist"} · ${
                        latestState.music.volume
                      }% volume`
                    : "Speakers are idle"}
                </p>
              ) : (
                <Placeholder />
              )}
            </StateCard>

            <StateCard title="Security">
              {latestState ? (
                <p className="text-sm text-slate-200">
                  {latestState.security.armed
                    ? `Armed (${latestState.security.mode.toUpperCase()})`
                    : "Disarmed"}
                </p>
              ) : (
                <Placeholder />
              )}
            </StateCard>

            <StateCard title="Reminders">
              {latestState ? (
                latestState.tasks.length > 0 ? (
                  <ul className="space-y-2 text-sm text-slate-200">
                    {latestState.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span
                          className={`${
                            task.completed
                              ? "text-slate-400 line-through"
                              : "text-slate-100"
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          {task.completed ? "Done" : "Active"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-300">
                    No active reminders.
                  </p>
                )
              ) : (
                <Placeholder />
              )}
            </StateCard>

            <StateCard title="Last Updated">
              <p className="text-sm text-slate-300">
                {latestState
                  ? new Date(latestState.lastUpdated).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "Waiting for first command…"}
              </p>
            </StateCard>
          </div>
        </aside>
      </div>
    </div>
  );
}

type StateCardProps = {
  title: string;
  children: React.ReactNode;
};

function StateCard({ title, children }: StateCardProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/5 bg-black/40 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Placeholder() {
  return (
    <div className="animate-pulse text-sm text-slate-500">
      Waiting for agent response…
    </div>
  );
}
