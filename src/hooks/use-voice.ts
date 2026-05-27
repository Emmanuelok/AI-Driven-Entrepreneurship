"use client";

import { useEffect, useRef, useState } from "react";

// Minimal SpeechRecognition types
interface SpeechRecognitionResult { 0: { transcript: string }; isFinal: boolean }
interface SpeechRecognitionEvent { results: ArrayLike<SpeechRecognitionResult> & { length: number } }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

export function useVoice(language = "en-US") {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  function start() {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = language;
    setTranscript("");
    r.onresult = (e) => {
      let acc = "";
      for (let i = 0; i < e.results.length; i++) acc += e.results[i][0].transcript;
      setTranscript(acc);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recRef.current = r;
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  function speak(text: string, lang = "en-US") {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  return { listening, transcript, supported, start, stop, speak };
}
