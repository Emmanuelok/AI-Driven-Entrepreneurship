// Snippets the student can ask Sage to inject into their current build.
// Each one is a clearly-scoped capability with a one-line instruction
// the user can send to the AI directly.

export type Snippet = {
  id: string;
  name: string;
  emoji: string;
  category: "AI" | "Input" | "Output" | "Hardware" | "Storage" | "Comms" | "Auth";
  description: string;
  prompt: string; // what gets sent to Sage to make this happen
  keywords: string[]; // for search
};

export const SNIPPETS: Snippet[] = [
  // AI
  {
    id: "claude-chat",
    name: "Claude chat (server-proxied)",
    emoji: "🧠",
    category: "AI",
    description: "Wire the build to call Claude through Sankofa's safe proxy. No exposed API key.",
    prompt:
      "Wire this build to call Claude through Sankofa's server proxy. When the user submits input, POST to `/api/build/proxy` with `{ model: 'claude-sonnet-4-6', messages: [...] }`. Show a typing indicator while the response streams in. Render the assistant reply nicely. No API key in the client.",
    keywords: ["llm", "chat", "claude", "ai", "response"],
  },
  {
    id: "vision-classify",
    name: "Image classification with Claude vision",
    emoji: "👁️",
    category: "AI",
    description: "Let the user upload an image; Claude analyses it and returns structured output.",
    prompt:
      "Add image upload (file input + drag-and-drop). When an image is picked, convert it to base64 and POST it to `/api/build/proxy` with a vision-enabled message asking Claude to classify what it sees. Render the result. Mobile-first.",
    keywords: ["vision", "image", "classify", "ocr"],
  },
  {
    id: "streaming-text",
    name: "Streaming text response (live typing)",
    emoji: "✍️",
    category: "AI",
    description: "Show the AI's response stream in word-by-word like Claude.ai does.",
    prompt:
      "Make the AI response stream in word-by-word using fetch with a ReadableStream from `/api/build/proxy?stream=1`. Append each chunk to the visible text as it arrives. Show a blinking cursor while streaming.",
    keywords: ["stream", "typing", "live"],
  },
  {
    id: "tool-use",
    name: "AI with tool use (function calling)",
    emoji: "🔧",
    category: "AI",
    description: "Let the AI call browser functions you define (search, calculator, fetch).",
    prompt:
      "Set up tool use. Define 3 client-side tools: `get_current_time()`, `search_open_data(q)`, and `compute(expression)`. Send tool definitions via the proxy. When Claude returns tool_use blocks, run the matching JS function locally and send the result back. Loop until Claude is done.",
    keywords: ["tools", "function-calling", "agent"],
  },

  // Input
  {
    id: "voice-stt",
    name: "Voice input (speech-to-text)",
    emoji: "🎙️",
    category: "Input",
    description: "Add a mic button. Browser Speech Recognition transcribes the user's voice.",
    prompt:
      "Add a microphone button using the Web Speech API (SpeechRecognition). When held, listen continuously and show the live transcript. When released, fill the main input with the transcript. Handle browsers that don't support it gracefully.",
    keywords: ["voice", "stt", "microphone", "speech"],
  },
  {
    id: "voice-tts",
    name: "Voice output (read aloud)",
    emoji: "🔊",
    category: "Output",
    description: "Speak AI responses aloud via the browser's speech synthesis.",
    prompt:
      "Add a small speaker button next to each AI response that, when clicked, reads the message aloud using SpeechSynthesisUtterance. Let the user pick from available voices in a dropdown.",
    keywords: ["voice", "tts", "speak", "speech"],
  },
  {
    id: "webcam",
    name: "Webcam capture",
    emoji: "📷",
    category: "Input",
    description: "Open the camera, snap a photo, use it in the app.",
    prompt:
      "Open the device camera via getUserMedia. Show the live video feed. Add a 'Snap' button that captures the current frame into a canvas. Provide the snapped image to the rest of the app as a base64 data URL.",
    keywords: ["camera", "webcam", "photo", "video"],
  },
  {
    id: "file-upload",
    name: "Drag-and-drop file upload",
    emoji: "📎",
    category: "Input",
    description: "Polished drag-drop zone for any file type.",
    prompt:
      "Add a drag-and-drop file upload zone. Accept any file. Show file preview (image thumbnail, text snippet, or filename + size). Make the dropzone visually respond to drag-over.",
    keywords: ["upload", "file", "drag", "drop"],
  },

  // Output
  {
    id: "chart",
    name: "Live data chart",
    emoji: "📈",
    category: "Output",
    description: "Render a simple line / bar chart from any data array (no library).",
    prompt:
      "Add a canvas chart that renders a line graph from an array of `{ x, y }` data points. No external libraries — draw with canvas API directly. Add axes, gridlines, and a tooltip on hover.",
    keywords: ["chart", "graph", "visualization", "canvas"],
  },
  {
    id: "map",
    name: "Interactive map (no API key)",
    emoji: "🗺️",
    category: "Output",
    description: "OpenStreetMap embed centered on a lat/lng. Pinable.",
    prompt:
      "Embed an OpenStreetMap iframe centered on a configurable lat/lng. Add a 'Drop pin here' input that re-centers the map. No Google Maps API key required.",
    keywords: ["map", "location", "lat", "lng", "openstreetmap"],
  },

  // Hardware
  {
    id: "web-serial",
    name: "Arduino via Web Serial",
    emoji: "🔌",
    category: "Hardware",
    description: "Connect to an Arduino over USB and send/receive serial messages.",
    prompt:
      "Add a 'Connect to Arduino' button using navigator.serial. Open the port at 9600 baud. Add a text-input + send-button that writes the message to the port. Stream incoming serial data into a log panel.",
    keywords: ["arduino", "serial", "robotics", "usb"],
  },
  {
    id: "geolocation",
    name: "User's location",
    emoji: "📍",
    category: "Hardware",
    description: "Get and display the user's GPS coordinates.",
    prompt:
      "Get the user's location via navigator.geolocation. Show coordinates + an approximate locality string. Handle permission-denied gracefully.",
    keywords: ["gps", "location", "geo"],
  },
  {
    id: "accelerometer",
    name: "Accelerometer (motion)",
    emoji: "📱",
    category: "Hardware",
    description: "Read the device's tilt/motion sensors.",
    prompt:
      "Read the device accelerometer via DeviceMotionEvent. Display X / Y / Z acceleration live. Trigger an event when the user shakes the device. Handle iOS permission prompts.",
    keywords: ["motion", "tilt", "accelerometer", "sensor"],
  },

  // Storage
  {
    id: "localstorage",
    name: "Save state to the device",
    emoji: "💾",
    category: "Storage",
    description: "Persist the user's state in localStorage so it survives reload.",
    prompt:
      "Persist the app state to localStorage under a unique key. Restore it on page load. Add a 'Reset' button that clears the saved state. Handle the storage quota error.",
    keywords: ["storage", "save", "persist", "local"],
  },
  {
    id: "qr-share",
    name: "QR code share",
    emoji: "🔳",
    category: "Output",
    description: "Generate a QR code so a phone can scan to use the build.",
    prompt:
      "Add a 'Share' button that opens a modal containing a QR code (generate it client-side with a small no-dependency QR algo) encoding the current page URL.",
    keywords: ["qr", "share", "mobile"],
  },

  // Comms
  {
    id: "whatsapp-deep-link",
    name: "WhatsApp deep-link send",
    emoji: "💬",
    category: "Comms",
    description: "Open WhatsApp with a pre-filled message to a number.",
    prompt:
      "Add a 'Send via WhatsApp' button. Build a wa.me URL with a pre-filled message and open it in a new tab. Allow the user to customize the message and recipient number.",
    keywords: ["whatsapp", "deeplink", "send"],
  },
  {
    id: "sms-deep-link",
    name: "SMS deep-link",
    emoji: "📨",
    category: "Comms",
    description: "Open the device's SMS app with a pre-filled body.",
    prompt:
      "Add a 'Send SMS' button that opens the user's SMS app with a sms: URI containing a pre-filled body and recipient.",
    keywords: ["sms", "text", "message"],
  },

  // Auth (stubs)
  {
    id: "magic-link",
    name: "Magic-link email auth (stub)",
    emoji: "✨",
    category: "Auth",
    description: "Add an email input + 'Send link' flow. Stub the verification.",
    prompt:
      "Add a sign-in flow. Email input → 'Send magic link' button. POST to /api/build/auth/request-link (you can stub this endpoint). Show 'Check your inbox' confirmation. After the user clicks the link, set a localStorage session and show the signed-in state.",
    keywords: ["auth", "login", "email", "magic"],
  },
];

export function snippetsByCategory(): Record<Snippet["category"], Snippet[]> {
  const out: Record<string, Snippet[]> = {};
  for (const s of SNIPPETS) {
    out[s.category] = out[s.category] ?? [];
    out[s.category].push(s);
  }
  return out as Record<Snippet["category"], Snippet[]>;
}

export function searchSnippets(q: string): Snippet[] {
  if (!q.trim()) return SNIPPETS;
  const lower = q.toLowerCase();
  return SNIPPETS.filter((s) =>
    s.name.toLowerCase().includes(lower) ||
    s.description.toLowerCase().includes(lower) ||
    s.keywords.some((k) => k.includes(lower)),
  );
}
