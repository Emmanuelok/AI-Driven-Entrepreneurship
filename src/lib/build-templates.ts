// Templates for the AI Build Studio. Each one is a fully-runnable starting
// point that maps to a discipline — so an agric student starts with a
// crop-disease scanner, a med student with a symptom triage UI, etc.
// Each template ships with the HTML/CSS/JS to render in the live preview
// iframe, and a hint of how to extend it via prompts.

export type BuildKind = "soft-ai" | "hard-ai" | "agentic" | "data" | "voice" | "vision" | "tool";
export type BuildLevel = "starter" | "intermediate" | "advanced";

export type BuildTemplate = {
  id: string;
  name: string;
  tagline: string;
  longDescription: string;
  emoji: string;
  kind: BuildKind;
  level: BuildLevel;
  disciplines: string[]; // matches Department.name keywords
  startingPrompt: string; // what Sage starts the project with
  starterCode: string; // self-contained HTML/CSS/JS to render
  extensionIdeas: string[];
  conceptsTouched: string[]; // ties into the knowledge graph
};

const baseStyle = `
  :root {
    color-scheme: dark;
    --bg: #0a0f0d;
    --surface: #141d1a;
    --surface-2: #1f2c28;
    --border: #2a3a35;
    --text: #e7efe9;
    --muted: #8aa39a;
    --accent: #2cc295;
    --warn: #f4a949;
    --danger: #d96444;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; min-height: 100vh; }
  button { font: inherit; cursor: pointer; border: none; }
  input, textarea, select { font: inherit; }
`;

export const BUILD_TEMPLATES: BuildTemplate[] = [
  {
    id: "crop-disease-scanner",
    name: "Crop Disease Scanner",
    tagline: "Snap a leaf → AI diagnoses the disease.",
    longDescription: "A mobile-first scanner that takes a photo of a plant leaf and tells the farmer what disease (if any) it has, in their language. Starts as a mock; you can wire it to a real vision model.",
    emoji: "🌿",
    kind: "vision",
    level: "intermediate",
    disciplines: ["Agricultural Engineering", "Crop Science", "Biology"],
    conceptsTouched: ["computer-vision", "mobile-ui", "image-upload", "model-inference"],
    startingPrompt: "A leaf scanner that lets a farmer snap a photo, then shows: detected disease (cassava mosaic / leaf spot / healthy), confidence, and what to do next — in 3 languages (English / Swahili / Pidgin).",
    extensionIdeas: [
      "Add a Twi-language option for Ghanaian farmers",
      "Connect to the Claude vision API to actually classify images",
      "Add a treatment recommendation database",
      "Make it work offline with a tiny on-device model",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 420px; margin: 0 auto; padding: 24px 18px 60px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .scan-box { border: 2px dashed var(--border); border-radius: 18px; padding: 32px 16px; text-align: center; background: var(--surface); }
  .scan-box.has-img { padding: 0; overflow: hidden; }
  .scan-box img { width: 100%; display: block; }
  .scan-btn { background: var(--accent); color: #000; font-weight: 600; padding: 14px 22px; border-radius: 999px; margin-top: 16px; }
  .lang { display: flex; gap: 6px; margin-bottom: 14px; }
  .lang button { background: var(--surface); color: var(--text); padding: 6px 12px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border); }
  .lang button.active { background: var(--accent); color: #000; border-color: var(--accent); }
  .result { margin-top: 20px; padding: 18px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); }
  .result h2 { margin: 0 0 6px; font-size: 18px; }
  .conf { color: var(--accent); font-family: monospace; font-size: 13px; }
  .advice { margin-top: 10px; font-size: 14px; color: var(--muted); line-height: 1.55; }
</style></head>
<body>
  <div class="app">
    <h1>🌿 Leaf Doctor</h1>
    <div class="sub">Snap a leaf, get a diagnosis.</div>
    <div class="lang">
      <button class="active" data-lang="en">English</button>
      <button data-lang="sw">Swahili</button>
      <button data-lang="pcm">Pidgin</button>
    </div>
    <div class="scan-box" id="scanBox">
      <div>📷 Take or upload a leaf photo</div>
      <input type="file" id="photo" accept="image/*" capture="environment" style="display:none"/>
      <button class="scan-btn" onclick="document.getElementById('photo').click()">Scan a leaf</button>
    </div>
    <div id="result"></div>
  </div>
  <script>
    const TXT = {
      en: { healthy: "Looks healthy.", disease: "Likely cassava mosaic disease.", advice: "Quarantine this plant. Spray neem-oil weekly. Remove infected leaves." },
      sw: { healthy: "Inaonekana mzima.", disease: "Pengine ugonjwa wa cassava mosaic.", advice: "Tenganisha mmea huu. Mwagia mafuta ya neem kila wiki. Ondoa majani yaliyoambukizwa." },
      pcm: { healthy: "Im dey alright.", disease: "E fit be cassava mosaic disease.", advice: "Separate this plant. Spray neem oil every week. Cut bad leafs comot." },
    };
    let lang = "en";
    document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll(".lang button").forEach(x => x.classList.remove("active"));
      b.classList.add("active"); lang = b.dataset.lang;
    }));
    document.getElementById("photo").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      const box = document.getElementById("scanBox");
      box.classList.add("has-img");
      box.innerHTML = '<img src="'+url+'"/>';
      // Mock inference — swap for a real API call:
      // const out = await fetch('/api/classify-leaf', { method: 'POST', body: f }).then(r=>r.json())
      const sick = Math.random() > 0.4;
      const t = TXT[lang];
      document.getElementById("result").innerHTML =
        '<div class="result"><h2>'+(sick ? t.disease : t.healthy)+'</h2>'+
        '<div class="conf">Confidence: '+(82 + Math.floor(Math.random()*14))+'%</div>'+
        '<div class="advice">'+(sick ? t.advice : "Keep doing what you're doing.")+'</div></div>';
    });
  </script>
</body></html>`,
  },

  {
    id: "whatsapp-bookkeeper",
    name: "WhatsApp-style Bookkeeping Bot",
    tagline: "Tell the bot what you sold, get clean books back.",
    longDescription: "A WhatsApp-like chat UI where a market vendor types 'sold 12 plates of jollof for 200 cedi' and the bot keeps the books. The interface is the product.",
    emoji: "💬",
    kind: "soft-ai",
    level: "starter",
    disciplines: ["Computer Science", "Finance & Banking", "Economics"],
    conceptsTouched: ["natural-language-parsing", "chat-ui", "double-entry", "voice-to-data"],
    startingPrompt: "A WhatsApp-style chat where a small business owner types what they sold and bought today, and the bot replies with a clean ledger and daily P&L.",
    extensionIdeas: [
      "Wire it to the Claude API so it parses any natural language input",
      "Add voice input via Web Speech API",
      "Add Pidgin / Swahili / Twi understanding",
      "Add an end-of-week summary the bot sends automatically",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 420px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; background: #0c1e16; }
  .header { background: #0a3a2c; color: white; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
  .header .avatar { width: 36px; height: 36px; background: #2cc295; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #000; }
  .messages { flex: 1; overflow-y: auto; padding: 16px; background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 100% 26px; }
  .msg { max-width: 78%; padding: 8px 12px; border-radius: 10px; margin-bottom: 8px; font-size: 14px; line-height: 1.4; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
  .me { background: #056162; color: white; margin-left: auto; }
  .bot { background: #1f2c28; color: var(--text); }
  .bot pre { background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; font-size: 12px; overflow-x: auto; margin: 6px 0; }
  .input { padding: 10px; background: #0a1614; display: flex; gap: 8px; }
  .input input { flex: 1; background: #1f2c28; color: var(--text); padding: 12px 14px; border-radius: 24px; border: none; outline: none; }
  .input button { background: #2cc295; color: #000; padding: 0 16px; border-radius: 24px; font-weight: 600; }
</style></head>
<body>
  <div class="app">
    <div class="header"><div class="avatar">B</div><div><div style="font-weight:600">Booky</div><div style="font-size:11px;opacity:.8">online · always-on bookkeeper</div></div></div>
    <div class="messages" id="msgs">
      <div class="msg bot">Akwaaba! Tell me what you sold or bought today. Example: "sold 12 plates of jollof for 15 cedis each"</div>
    </div>
    <div class="input">
      <input id="inp" placeholder="What happened today?"/>
      <button onclick="send()">Send</button>
    </div>
  </div>
  <script>
    const ledger = [];
    function parse(text) {
      const m = text.toLowerCase().match(/(sold|bought)\\s+(\\d+)\\s+([\\w\\s]+?)\\s+(for|at)\\s+(\\d+(?:\\.\\d+)?)\\s*(?:cedis?|naira|shillings?)?\\s*(?:each)?/);
      if (!m) return null;
      const isSale = m[1] === "sold";
      const qty = parseInt(m[2]);
      const item = m[3].trim();
      const price = parseFloat(m[5]);
      const isEach = /each/.test(text.toLowerCase());
      const total = isEach ? qty * price : price;
      return { kind: isSale ? "sale" : "purchase", item, qty, total };
    }
    function send() {
      const inp = document.getElementById("inp");
      const text = inp.value.trim(); if (!text) return;
      add("me", text); inp.value = "";
      const entry = parse(text);
      if (!entry) {
        add("bot", "I didn't catch that. Try: 'sold 12 plates of jollof for 15 cedis each'");
        return;
      }
      ledger.push(entry);
      const sales = ledger.filter(e => e.kind === "sale").reduce((s,e) => s + e.total, 0);
      const cost = ledger.filter(e => e.kind === "purchase").reduce((s,e) => s + e.total, 0);
      const pnl = sales - cost;
      add("bot", '✓ Logged: '+entry.qty+' '+entry.item+' '+(entry.kind === "sale" ? "out" : "in")+' for ₵'+entry.total.toFixed(2)+
        '<pre>Sales today:    ₵'+sales.toFixed(2)+'\\nCost today:     ₵'+cost.toFixed(2)+'\\nNet (P&L):      ₵'+pnl.toFixed(2)+' '+(pnl>=0?'🟢':'🔴')+'</pre>');
    }
    function add(who, html) {
      const d = document.createElement("div"); d.className = "msg "+who; d.innerHTML = html;
      const m = document.getElementById("msgs"); m.appendChild(d); m.scrollTop = m.scrollHeight;
    }
    document.getElementById("inp").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  </script>
</body></html>`,
  },

  {
    id: "triage-co-pilot",
    name: "CHW Triage Co-pilot",
    tagline: "A guided symptom interview that recommends next steps.",
    longDescription: "A clean, low-bandwidth UI a community health worker can use on a $50 phone. Walks through symptoms with the patient, suggests level of care needed, and logs the case.",
    emoji: "🩺",
    kind: "soft-ai",
    level: "intermediate",
    disciplines: ["Medicine", "Public Health", "Nursing"],
    conceptsTouched: ["clinical-decision-support", "triage", "low-bandwidth-ui", "structured-interview"],
    startingPrompt: "A symptom triage co-pilot for community health workers. Walks the worker through a guided interview, scores severity, and recommends: home care / clinic / hospital / emergency.",
    extensionIdeas: [
      "Add a Hausa / Yoruba voice version",
      "Wire to Claude for free-text 'tell me what you see' input",
      "Add a referral queue that syncs when online",
      "Add a maternal-health specialty mode",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 480px; margin: 0 auto; padding: 22px 18px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 22px; }
  .q { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; margin-bottom: 10px; }
  .q h3 { margin: 0 0 12px; font-size: 16px; }
  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .opts button { background: var(--surface-2); color: var(--text); padding: 14px; border-radius: 10px; border: 1px solid var(--border); }
  .opts button.sel { background: var(--accent); color: #000; border-color: var(--accent); }
  .verdict { padding: 22px; border-radius: 16px; text-align: center; margin-top: 18px; }
  .verdict.home { background: rgba(44,194,149,0.15); border: 1px solid rgba(44,194,149,0.4); }
  .verdict.clinic { background: rgba(244,169,73,0.15); border: 1px solid rgba(244,169,73,0.4); }
  .verdict.hospital { background: rgba(217,100,68,0.15); border: 1px solid rgba(217,100,68,0.4); }
  .verdict h2 { margin: 0 0 6px; }
  .verdict .where { font-size: 24px; font-weight: 700; margin-bottom: 10px; }
  .nav { display: flex; justify-content: space-between; margin-top: 16px; }
  .nav button { background: transparent; color: var(--accent); padding: 8px 14px; }
  progress { width: 100%; height: 4px; }
</style></head>
<body>
  <div class="app">
    <h1>🩺 Triage Co-pilot</h1>
    <div class="sub">For community health workers · works offline</div>
    <progress id="prog" max="4" value="0"></progress>
    <div id="content"></div>
  </div>
  <script>
    const Q = [
      { id: "fever", q: "Does the patient have fever?", opts: [["No fever",0],["Mild (<38°C)",1],["Moderate (38–39°C)",2],["High (>39°C)",3]] },
      { id: "breath", q: "Breathing?", opts: [["Normal",0],["Slightly fast",1],["Fast and shallow",3],["Struggling / gasping",5]] },
      { id: "drink", q: "Can they drink water?", opts: [["Yes, normally",0],["Less than usual",1],["Refuses / can't",3],["Vomits everything",4]] },
      { id: "consc", q: "Are they alert?", opts: [["Fully alert",0],["Drowsy",2],["Confused",4],["Unresponsive",6]] },
    ];
    let answers = {};
    let i = 0;
    function render() {
      document.getElementById("prog").value = i;
      if (i >= Q.length) return showVerdict();
      const q = Q[i];
      document.getElementById("content").innerHTML =
        '<div class="q"><h3>'+q.q+'</h3><div class="opts">'+
        q.opts.map((o,idx) => '<button onclick="pick(\\''+q.id+'\\','+o[1]+')">'+o[0]+'</button>').join("")+
        '</div></div><div class="nav"><button onclick="back()" '+(i===0?'disabled':'')+'>← Back</button></div>';
    }
    function pick(id, score) { answers[id] = score; i++; render(); }
    function back() { if (i > 0) i--; render(); }
    function showVerdict() {
      const total = Object.values(answers).reduce((a,b) => a+b, 0);
      let where, klass, advice;
      if (total <= 2) { where = "🏠 Home care"; klass = "home"; advice = "Rest. Drink fluids. Check back in 24h. Return if symptoms worsen."; }
      else if (total <= 6) { where = "🏥 Clinic visit"; klass = "clinic"; advice = "Schedule a clinic visit within 24 hours. Continue fluids and monitor temperature."; }
      else if (total <= 12) { where = "🏥 Hospital today"; klass = "hospital"; advice = "Refer to district hospital today. Arrange transport. Do not delay."; }
      else { where = "🚨 Emergency now"; klass = "hospital"; advice = "Emergency referral. Call ambulance or arrange immediate transport. Stay with patient."; }
      document.getElementById("content").innerHTML =
        '<div class="verdict '+klass+'"><h2>Recommendation</h2><div class="where">'+where+'</div><div>'+advice+'</div></div>'+
        '<div class="nav"><button onclick="reset()">↻ New patient</button></div>';
    }
    function reset() { answers = {}; i = 0; render(); }
    render();
  </script>
</body></html>`,
  },

  {
    id: "voice-journal",
    name: "Voice Journal that Listens",
    tagline: "Tap, talk, the AI transcribes and reflects back.",
    longDescription: "A voice-first journaling app. The student presses one button, speaks, gets a transcript + a one-line reflection. Demonstrates Web Speech API + LLM integration.",
    emoji: "🎙️",
    kind: "voice",
    level: "starter",
    disciplines: ["Psychology", "Education", "Computer Science"],
    conceptsTouched: ["web-speech-api", "voice-ui", "llm-reflection", "personal-data"],
    startingPrompt: "A voice journaling app. One big button. Hold to record. Release to transcribe. Then the AI reflects back one supportive sentence.",
    extensionIdeas: [
      "Add multilingual transcription via Whisper",
      "Save entries with mood tags",
      "Show a mood graph over time",
      "Add an emergency-resource hint when distress is detected",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 420px; margin: 0 auto; padding: 28px 20px; min-height: 100vh; display: flex; flex-direction: column; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .sub { color: var(--muted); margin-bottom: 32px; font-size: 13px; }
  .mic-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; flex: 1; justify-content: center; }
  .mic { width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #2cc295, #0c8f6a); display: flex; align-items: center; justify-content: center; font-size: 50px; box-shadow: 0 0 0 0 rgba(44,194,149,0.5); transition: transform 0.2s; }
  .mic.rec { animation: pulse 1.4s infinite; transform: scale(1.05); }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(44,194,149,0.5); } 70% { box-shadow: 0 0 0 30px rgba(44,194,149,0); } }
  .label { color: var(--muted); font-size: 14px; }
  .entries { margin-top: 24px; }
  .entry { background: var(--surface); padding: 14px; border-radius: 12px; margin-bottom: 10px; border-left: 3px solid var(--accent); }
  .entry .when { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .entry .text { font-size: 14px; line-height: 1.5; }
  .entry .reflect { margin-top: 8px; font-size: 13px; color: var(--accent); font-style: italic; }
</style></head>
<body>
  <div class="app">
    <h1>🎙️ Voice Journal</h1>
    <div class="sub">Press, talk, let it out.</div>
    <div class="mic-wrap">
      <div class="mic" id="mic">🎤</div>
      <div class="label" id="label">Tap to record</div>
      <div id="transcript" style="color:var(--muted);font-size:13px;min-height:20px"></div>
    </div>
    <div class="entries" id="entries"></div>
  </div>
  <script>
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById("mic");
    const label = document.getElementById("label");
    const transcript = document.getElementById("transcript");
    let recognition = null;
    let recording = false;
    const reflections = [
      "I hear you. Take a breath.",
      "That sounds like a lot. You named it — that's already brave.",
      "What's one small thing that would help right now?",
      "Keep going. The act of saying it out loud is the work.",
      "Notice what you noticed. That's wisdom forming.",
    ];

    function startRec() {
      if (!SR) { label.textContent = "Voice not supported in this browser"; return; }
      recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (e) => {
        let acc = "";
        for (let i = 0; i < e.results.length; i++) acc += e.results[i][0].transcript;
        transcript.textContent = acc;
      };
      recognition.onend = () => {
        recording = false;
        mic.classList.remove("rec");
        label.textContent = "Tap to record";
        if (transcript.textContent.trim()) save(transcript.textContent.trim());
        transcript.textContent = "";
      };
      recognition.start();
      recording = true;
      mic.classList.add("rec");
      label.textContent = "Listening… tap to stop";
    }

    function stopRec() { if (recognition) recognition.stop(); }
    mic.addEventListener("click", () => recording ? stopRec() : startRec());

    function save(text) {
      const refl = reflections[Math.floor(Math.random() * reflections.length)];
      const d = document.createElement("div"); d.className = "entry";
      d.innerHTML = '<div class="when">'+new Date().toLocaleTimeString()+'</div>'+
        '<div class="text">"'+text+'"</div>'+
        '<div class="reflect">'+refl+'</div>';
      document.getElementById("entries").prepend(d);
    }
  </script>
</body></html>`,
  },

  {
    id: "pricing-calculator",
    name: "Pricing Calculator (Live)",
    tagline: "Sliders that compute unit economics in real time.",
    longDescription: "An interactive pricing model. Move sliders, see breakeven, payback period, gross margin update live. Great for founders to share with a co-founder over coffee.",
    emoji: "📊",
    kind: "tool",
    level: "starter",
    disciplines: ["Economics", "Finance & Banking", "Marketing & Sales"],
    conceptsTouched: ["unit-economics", "interactive-ui", "live-computation", "sliders"],
    startingPrompt: "A live pricing calculator for a subscription product. Inputs: price/mo, COGS, CAC, churn. Outputs: gross margin, payback months, LTV, breakeven units. All sliders, all live.",
    extensionIdeas: [
      "Add a scenario save/share feature",
      "Add a per-channel CAC breakdown",
      "Add seasonality / growth curve visualization",
      "Export the model as a Google Sheet template",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 760px; margin: 0 auto; padding: 28px 22px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  .input { background: var(--surface); padding: 16px; border-radius: 14px; border: 1px solid var(--border); }
  .input label { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
  .input label .val { color: var(--accent); font-family: monospace; }
  .input input { width: 100%; accent-color: var(--accent); }
  .results { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
  @media (max-width: 700px) { .results { grid-template-columns: 1fr 1fr; } }
  .stat { background: var(--surface-2); padding: 16px; border-radius: 14px; border: 1px solid var(--border); }
  .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); }
  .stat .v { font-size: 22px; font-weight: 600; margin-top: 6px; font-family: monospace; }
  .stat.good .v { color: var(--accent); } .stat.warn .v { color: var(--warn); } .stat.bad .v { color: var(--danger); }
  .takeaway { margin-top: 20px; padding: 16px 18px; border-radius: 14px; background: rgba(44,194,149,0.08); border: 1px solid rgba(44,194,149,0.3); font-size: 14px; line-height: 1.6; }
</style></head>
<body>
  <div class="app">
    <h1>📊 Live Pricing Model</h1>
    <div class="sub">Drag the sliders. The economics move with you.</div>
    <div class="grid" id="inputs"></div>
    <div class="results" id="results"></div>
    <div class="takeaway" id="takeaway"></div>
  </div>
  <script>
    const INPUTS = [
      { id: "price", label: "Price per month ($)", min: 1, max: 200, step: 1, value: 50 },
      { id: "cogs", label: "Variable cost per customer ($)", min: 0, max: 100, step: 1, value: 15 },
      { id: "cac", label: "Customer acquisition cost ($)", min: 0, max: 500, step: 5, value: 80 },
      { id: "churn", label: "Monthly churn (%)", min: 1, max: 30, step: 0.5, value: 5 },
    ];
    const state = {};
    function render() {
      const inp = document.getElementById("inputs");
      inp.innerHTML = INPUTS.map(i => {
        if (!(i.id in state)) state[i.id] = i.value;
        return '<div class="input"><label>'+i.label+'<span class="val">'+state[i.id]+'</span></label>'+
          '<input type="range" min="'+i.min+'" max="'+i.max+'" step="'+i.step+'" value="'+state[i.id]+'" oninput="state.'+i.id+'=+this.value; render();"/></div>';
      }).join("");
      const gm = (state.price - state.cogs) / state.price * 100;
      const payback = state.cac / (state.price - state.cogs);
      const ltv = (state.price - state.cogs) / (state.churn / 100);
      const ltvCac = ltv / state.cac;
      document.getElementById("results").innerHTML =
        stat("Gross margin", gm.toFixed(0)+"%", gm > 70 ? "good" : gm > 40 ? "warn" : "bad")+
        stat("Payback", payback.toFixed(1)+" mo", payback < 6 ? "good" : payback < 18 ? "warn" : "bad")+
        stat("LTV", "$"+ltv.toFixed(0), ltv > 500 ? "good" : "warn")+
        stat("LTV : CAC", ltvCac.toFixed(1)+"×", ltvCac > 3 ? "good" : ltvCac > 1.5 ? "warn" : "bad");
      let advice = "";
      if (ltvCac > 5) advice = "Strong unit economics — you can spend more on CAC to grow faster.";
      else if (ltvCac > 3) advice = "Healthy. Test pushing CAC up to grow faster.";
      else if (ltvCac > 1.5) advice = "Borderline. Watch churn carefully and try to lift the price.";
      else advice = "These economics break the business. Cut CAC, raise price, or reduce churn before scaling.";
      document.getElementById("takeaway").textContent = advice;
    }
    function stat(l, v, cls) { return '<div class="stat '+cls+'"><div class="label">'+l+'</div><div class="v">'+v+'</div></div>'; }
    window.state = state; window.render = render;
    render();
  </script>
</body></html>`,
  },

  {
    id: "robotics-claw-sim",
    name: "Robotic Claw Controller",
    tagline: "A virtual claw — wire it to real Arduino later.",
    longDescription: "A web-based controller that drives a virtual robotic claw via on-screen joystick. The code is written so each command (rotate, extend, grip) can later route to an Arduino over Web Serial.",
    emoji: "🦾",
    kind: "hard-ai",
    level: "advanced",
    disciplines: ["Mechanical Engineering", "Electrical & Electronic Engineering", "Computer Science"],
    conceptsTouched: ["robotics", "kinematics", "control-loop", "web-serial", "real-time-ui"],
    startingPrompt: "A web controller for a 3-DOF robotic claw. Inverse kinematics computed from on-screen joystick. Visual feedback. Commands serialized for Arduino over Web Serial.",
    extensionIdeas: [
      "Connect via Web Serial to a real Arduino + servos",
      "Add a 'teach mode' that records and replays a sequence",
      "Add object-detection from a webcam stream to auto-pick",
      "Add gesture control via MediaPipe Hands",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 700px; margin: 0 auto; padding: 22px 18px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin-bottom: 20px; }
  canvas { background: #06100d; border: 1px solid var(--border); border-radius: 14px; display: block; width: 100%; height: auto; }
  .panel { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
  .ctrl { background: var(--surface); padding: 14px; border-radius: 12px; border: 1px solid var(--border); }
  .ctrl label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; color: var(--muted); }
  .ctrl input { width: 100%; accent-color: var(--accent); }
  .grip { background: var(--accent); color: #000; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; }
  .grip.open { background: var(--warn); }
  .telemetry { font-family: monospace; font-size: 12px; color: var(--muted); margin-top: 12px; line-height: 1.6; }
  .telemetry .k { color: var(--accent); }
</style></head>
<body>
  <div class="app">
    <h1>🦾 Claw Controller</h1>
    <div class="sub">3-DOF virtual claw · ready to wire to Arduino</div>
    <canvas id="cv" width="640" height="380"></canvas>
    <div class="panel">
      <div class="ctrl">
        <label>Base angle θ₁ <span id="t1v">90°</span></label>
        <input type="range" id="t1" min="0" max="180" value="90"/>
        <label style="margin-top:10px">Shoulder θ₂ <span id="t2v">60°</span></label>
        <input type="range" id="t2" min="0" max="180" value="60"/>
        <label style="margin-top:10px">Elbow θ₃ <span id="t3v">110°</span></label>
        <input type="range" id="t3" min="0" max="180" value="110"/>
      </div>
      <div class="ctrl">
        <button class="grip" id="grip">✊ GRIP</button>
        <div class="telemetry" id="tel"></div>
        <div style="margin-top:12px"><button onclick="connectSerial()" style="background:var(--surface-2);color:var(--text);padding:10px;border-radius:10px;width:100%">⚡ Connect Arduino (Web Serial)</button></div>
      </div>
    </div>
  </div>
  <script>
    const cv = document.getElementById("cv"); const ctx = cv.getContext("2d");
    const L1 = 90, L2 = 80, L3 = 50;
    let port = null;
    function draw() {
      const t1 = +document.getElementById("t1").value;
      const t2 = +document.getElementById("t2").value;
      const t3 = +document.getElementById("t3").value;
      const open = !document.getElementById("grip").classList.contains("open");
      document.getElementById("t1v").textContent = t1+"°";
      document.getElementById("t2v").textContent = t2+"°";
      document.getElementById("t3v").textContent = t3+"°";

      ctx.clearRect(0,0,cv.width,cv.height);
      // ground
      ctx.fillStyle = "#0f2922"; ctx.fillRect(0, 340, cv.width, 40);
      ctx.strokeStyle = "rgba(231,239,233,0.12)"; ctx.lineWidth = 1;
      for (let i = 0; i < cv.width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 340); ctx.lineTo(i, 380); ctx.stroke(); }

      // forward kinematics
      const cx = cv.width/2, cy = 340;
      const a1 = (180 - t1) * Math.PI/180;
      const a2 = (180 - t2) * Math.PI/180;
      const a3 = (180 - t3) * Math.PI/180;

      const x1 = cx + L1 * Math.cos(a1), y1 = cy - L1 * Math.sin(a1);
      const x2 = x1 + L2 * Math.cos(a1+a2-Math.PI), y2 = y1 - L2 * Math.sin(a1+a2-Math.PI);
      const x3 = x2 + L3 * Math.cos(a1+a2+a3-2*Math.PI), y3 = y2 - L3 * Math.sin(a1+a2+a3-2*Math.PI);

      // arm segments
      ctx.lineCap = "round"; ctx.strokeStyle = "#2cc295"; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = "#f4a949"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = "#6c8cff"; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();

      // joints
      [[cx,cy],[x1,y1],[x2,y2]].forEach(([x,y]) => {
        ctx.fillStyle = "#0a0f0d"; ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#e7efe9"; ctx.lineWidth = 2; ctx.stroke();
      });

      // gripper
      ctx.strokeStyle = "#e7efe9"; ctx.lineWidth = 3;
      const ga = a1+a2+a3-2*Math.PI;
      const gw = open ? 14 : 3;
      ctx.beginPath();
      ctx.moveTo(x3 + Math.cos(ga - Math.PI/2)*gw, y3 - Math.sin(ga - Math.PI/2)*gw);
      ctx.lineTo(x3 + Math.cos(ga)*18 + Math.cos(ga - Math.PI/2)*gw, y3 - Math.sin(ga)*18 - Math.sin(ga - Math.PI/2)*gw);
      ctx.moveTo(x3 + Math.cos(ga + Math.PI/2)*gw, y3 - Math.sin(ga + Math.PI/2)*gw);
      ctx.lineTo(x3 + Math.cos(ga)*18 + Math.cos(ga + Math.PI/2)*gw, y3 - Math.sin(ga)*18 - Math.sin(ga + Math.PI/2)*gw);
      ctx.stroke();

      // telemetry
      document.getElementById("tel").innerHTML =
        '<div><span class="k">end_effector</span> = (' + (x3-cx).toFixed(0) + ', ' + (cy-y3).toFixed(0) + ')</div>'+
        '<div><span class="k">grip_state</span> = ' + (open ? "OPEN" : "CLOSED") + '</div>'+
        '<div><span class="k">serial_out</span> = MOVE,'+t1+','+t2+','+t3+','+(open?0:1)+'</div>';

      sendSerial("MOVE,"+t1+","+t2+","+t3+","+(open?0:1));
    }
    async function connectSerial() {
      if (!navigator.serial) { alert("Web Serial not available. Use Chrome/Edge over HTTPS."); return; }
      try { port = await navigator.serial.requestPort(); await port.open({ baudRate: 9600 }); alert("Connected to Arduino"); }
      catch (e) { alert("Failed: "+e.message); }
    }
    async function sendSerial(s) {
      if (!port?.writable) return;
      const w = port.writable.getWriter();
      await w.write(new TextEncoder().encode(s+"\\n"));
      w.releaseLock();
    }
    document.getElementById("grip").addEventListener("click", e => { e.target.classList.toggle("open"); e.target.textContent = e.target.classList.contains("open") ? "✋ OPEN" : "✊ GRIP"; draw(); });
    ["t1","t2","t3"].forEach(id => document.getElementById(id).addEventListener("input", draw));
    draw();
  </script>
</body></html>`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AI AGENT TEMPLATES — ready-to-extend, calls Claude through Sankofa's
  // built-in /api/build/proxy so no API key in the client.
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: "simple-chat-agent",
    name: "Simple Chat Agent",
    tagline: "Your first AI agent — a working chatbot wired to Claude.",
    longDescription: "A clean chat UI that streams Claude responses through Sankofa's built-in AI proxy. No API key needed. Customize the system prompt to make it a tutor, a coach, a writing partner — anything.",
    emoji: "🤖",
    kind: "agentic",
    level: "starter",
    disciplines: ["Computer Science", "Education", "Psychology"],
    conceptsTouched: ["agent-loop", "system-prompt", "streaming", "chat-ui"],
    startingPrompt: "A chat agent. Tweak the system prompt at the top of the script to give the bot a personality — try 'a market trader from Tamale who only speaks Pidgin'.",
    extensionIdeas: [
      "Add a personality picker (tutor / coach / market trader / etc.)",
      "Give the agent memory of the last 10 turns",
      "Add a 'reset' button + saved conversations sidebar",
      "Make it switch to Twi / Hausa / Swahili based on the user's first message",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 760px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; }
  .header { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .avatar { width: 36px; height: 36px; border-radius: 12px; background: linear-gradient(135deg, var(--accent), var(--warn)); display: grid; place-items: center; color: #000; font-weight: 700; }
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .msg { max-width: 78%; padding: 12px 14px; border-radius: 14px; font-size: 15px; line-height: 1.55; }
  .me { background: rgba(44,194,149,0.15); border: 1px solid rgba(44,194,149,0.3); align-self: flex-end; }
  .bot { background: var(--surface); border: 1px solid var(--border); align-self: flex-start; white-space: pre-wrap; }
  .input { padding: 14px; border-top: 1px solid var(--border); display: flex; gap: 10px; }
  .input input { flex: 1; background: var(--surface-2); color: var(--text); padding: 12px 16px; border-radius: 999px; border: 1px solid var(--border); outline: none; font-size: 15px; }
  .input button { background: var(--accent); color: #000; padding: 0 22px; border-radius: 999px; font-weight: 700; }
  .typing { color: var(--muted); font-style: italic; font-size: 13px; align-self: flex-start; padding: 4px 14px; }
</style></head>
<body>
  <div class="app">
    <div class="header"><div class="avatar">🤖</div><div><div style="font-weight:600">Claude Agent</div><div style="font-size:11px;color:var(--muted)">via Sankofa proxy</div></div></div>
    <div class="messages" id="msgs"></div>
    <form class="input" onsubmit="event.preventDefault(); send()">
      <input id="inp" placeholder="Say something…" autofocus/>
      <button type="submit">Send</button>
    </form>
  </div>
  <script>
    // ───────────────────────────────────────────────────────────────────
    // Change me. This is your agent's brain.
    const SYSTEM = "You are a warm, helpful tutor. Use African / developing-world examples (mama-put, tro-tro, M-Pesa) when explaining concepts. Keep replies to 3-4 short paragraphs.";
    // ───────────────────────────────────────────────────────────────────
    const history = [];
    function add(role, text) {
      const el = document.createElement("div");
      el.className = "msg " + (role === "user" ? "me" : "bot");
      el.textContent = text;
      document.getElementById("msgs").appendChild(el);
      el.scrollIntoView({ behavior: "smooth" });
      return el;
    }
    async function send() {
      const inp = document.getElementById("inp");
      const text = inp.value.trim(); if (!text) return;
      add("user", text); inp.value = "";
      history.push({ role: "user", content: text });
      const el = add("assistant", "");
      const typing = document.createElement("div");
      typing.className = "typing"; typing.textContent = "thinking…";
      document.getElementById("msgs").appendChild(typing);
      try {
        const res = await fetch("/api/build/proxy?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: SYSTEM, messages: history.slice(-10), max_tokens: 800 }),
        });
        typing.remove();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          el.textContent = acc;
          el.scrollIntoView({ behavior: "smooth" });
        }
        history.push({ role: "assistant", content: acc });
      } catch (e) {
        typing.remove();
        el.textContent = "Network hiccup: " + e.message;
      }
    }
  </script>
</body></html>`,
  },

  {
    id: "tool-use-agent",
    name: "Tool-Use Agent",
    tagline: "An agent that calls JavaScript functions to get things done.",
    longDescription: "The agent loop: AI thinks → calls a tool → tool returns data → AI continues. This template gives Claude three tools (current time, calculator, simple search) and lets it use them autonomously.",
    emoji: "🛠️",
    kind: "agentic",
    level: "intermediate",
    disciplines: ["Computer Science", "Mathematics & Statistics"],
    conceptsTouched: ["tool-use", "function-calling", "agent-loop", "autonomous-reasoning"],
    startingPrompt: "A tool-using agent. The starter has 3 tools — current_time, calculator, and a stub search. Ask things like 'what's 12.5% of last week's total if the total was 4,200 cedis?' and watch the agent reason → call the tool → reason → reply.",
    extensionIdeas: [
      "Add a 'weather' tool that hits a public weather API",
      "Add a 'save_note' tool that writes to localStorage",
      "Add a 'send_whatsapp' tool that opens wa.me with the agent's text",
      "Add a 'query_database' tool that searches a tiny inline JSON dataset",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 800px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 14px 18px; border-bottom: 1px solid var(--border); }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .messages { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .msg { padding: 10px 14px; border-radius: 12px; max-width: 88%; font-size: 14px; line-height: 1.5; }
  .user { background: rgba(44,194,149,0.15); border: 1px solid rgba(44,194,149,0.3); align-self: flex-end; }
  .bot { background: var(--surface); border: 1px solid var(--border); align-self: flex-start; white-space: pre-wrap; }
  .tool { font-family: monospace; font-size: 12px; background: rgba(244,169,73,0.12); border: 1px solid rgba(244,169,73,0.3); color: var(--warn); padding: 8px 12px; border-radius: 10px; align-self: flex-start; max-width: 88%; }
  .tool .k { color: var(--accent); }
  form { padding: 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  input { flex: 1; background: var(--surface-2); padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); color: var(--text); outline: none; }
  button { background: var(--accent); color: #000; padding: 0 20px; border-radius: 10px; font-weight: 600; }
</style></head>
<body>
  <div class="app">
    <header>
      <h1>🛠️ Tool-Use Agent</h1>
      <p>Ask it something that requires a tool. Watch the agent loop.</p>
    </header>
    <div class="messages" id="msgs">
      <div class="bot">Hi. I have three tools available: <code>get_current_time</code>, <code>calculate(expr)</code>, and <code>search(query)</code>. Ask me something that needs one and you'll see me use it.</div>
    </div>
    <form onsubmit="event.preventDefault(); ask()">
      <input id="inp" placeholder="e.g. What's 12.5% of 4200?" autofocus/>
      <button>Ask</button>
    </form>
  </div>
  <script>
    // The tools the agent can use. Each maps to a real JS function.
    const TOOLS = {
      get_current_time: { describe: "Returns the current local time as a string. No arguments.", run: () => new Date().toLocaleString() },
      calculate: { describe: "Evaluates a math expression. Arg: { expression: string }. Returns the number.", run: (args) => { try { return String(Function('"use strict";return ('+args.expression+')')()); } catch (e) { return "error: "+e.message; } } },
      search: { describe: "Stub search. Returns canned results. Arg: { query: string }.", run: (args) => "Top result for '"+args.query+"': (this is a stub — wire to a real search API to make it real)" },
    };

    const SYSTEM = "You are a helpful agent with access to tools. When the user asks something that requires a tool, you MUST use it instead of guessing. Available tools:\\n" +
      Object.entries(TOOLS).map(([n, t]) => "- " + n + ": " + t.describe).join("\\n") +
      "\\n\\nTo use a tool, reply with EXACTLY this format (and nothing else): <tool>{\\"name\\":\\"tool_name\\",\\"args\\":{...}}</tool>\\n\\nWhen you have the answer, reply normally to the user.";

    const history = [];

    function add(cls, html) {
      const el = document.createElement("div"); el.className = "msg " + cls; el.innerHTML = html;
      document.getElementById("msgs").appendChild(el); el.scrollIntoView({ behavior: "smooth" }); return el;
    }
    function addTool(name, args, result) {
      const el = document.createElement("div"); el.className = "tool";
      el.innerHTML = '<span class="k">→ '+name+'</span>(' + JSON.stringify(args) + ')<br><span style="color:var(--text)">'+result+'</span>';
      document.getElementById("msgs").appendChild(el); el.scrollIntoView({ behavior: "smooth" }); return el;
    }

    async function callClaude(messages) {
      const res = await fetch("/api/build/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: SYSTEM, messages: messages, max_tokens: 600 }),
      });
      const data = await res.json();
      return data.content || "";
    }

    async function ask() {
      const inp = document.getElementById("inp");
      const q = inp.value.trim(); if (!q) return;
      add("user", q); inp.value = "";
      history.push({ role: "user", content: q });

      // Agent loop — up to 4 iterations
      for (let i = 0; i < 4; i++) {
        const reply = await callClaude(history);
        history.push({ role: "assistant", content: reply });
        const m = reply.match(/<tool>([\\s\\S]+?)<\\/tool>/);
        if (!m) {
          add("bot", reply.replace(/</g, "&lt;"));
          return;
        }
        let call;
        try { call = JSON.parse(m[1]); }
        catch (e) { add("bot", "I tried to call a tool but the JSON was malformed: " + e.message); return; }
        const tool = TOOLS[call.name];
        if (!tool) { add("bot", "Unknown tool: " + call.name); return; }
        const result = tool.run(call.args || {});
        addTool(call.name, call.args || {}, result);
        history.push({ role: "user", content: "<tool_result>"+result+"</tool_result>" });
      }
      add("bot", "(stopped after 4 tool iterations to be safe)");
    }
  </script>
</body></html>`,
  },

  {
    id: "voice-agent",
    name: "Voice Agent (talk to it)",
    tagline: "Push to talk. AI replies. Spoken back to you.",
    longDescription: "A full voice loop: Web Speech recognition → Claude → text-to-speech reply. Hands-free conversation in your browser. Perfect for a literacy-tolerant tool or accessibility-first product.",
    emoji: "🗣️",
    kind: "agentic",
    level: "intermediate",
    disciplines: ["Computer Science", "Public Health", "Psychology", "Nursing"],
    conceptsTouched: ["voice-agent", "speech-to-text", "text-to-speech", "real-time-ui"],
    startingPrompt: "A voice-first agent. Hold the big button, speak. The AI replies. Tweak the system prompt to give it a role (community health worker companion / language tutor / journaling partner).",
    extensionIdeas: [
      "Add a language picker (en-US, sw-KE, ha-NG, fr-FR)",
      "Show the live transcript while you're speaking",
      "Save each turn to localStorage so you can revisit",
      "Switch to push-to-talk + voice-activated for hands-free mode",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 480px; margin: 0 auto; padding: 24px 20px; min-height: 100vh; display: flex; flex-direction: column; gap: 16px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: var(--muted); font-size: 13px; }
  .transcript { background: var(--surface); padding: 16px; border-radius: 14px; min-height: 100px; font-size: 14px; line-height: 1.55; border: 1px solid var(--border); flex: 1; overflow-y: auto; max-height: 50vh; }
  .turn { margin-bottom: 12px; }
  .turn.user { color: var(--muted); font-style: italic; }
  .turn.bot { color: var(--text); }
  .turn.bot::before { content: "🤖 "; }
  .button-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 0; }
  .mic { width: 120px; height: 120px; border-radius: 60px; background: radial-gradient(circle at 30% 30%, var(--accent), var(--emerald-deep, #0c8f6a)); display: grid; place-items: center; font-size: 50px; box-shadow: 0 0 0 0 rgba(44,194,149,0.5); user-select: none; cursor: pointer; transition: transform 0.15s; }
  .mic:active, .mic.rec { transform: scale(0.95); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(44,194,149,0.5); } 70% { box-shadow: 0 0 0 24px rgba(44,194,149,0); } }
  .status { color: var(--muted); font-size: 13px; min-height: 18px; }
  select { background: var(--surface-2); color: var(--text); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); }
</style></head>
<body>
  <div class="app">
    <div>
      <h1>🗣️ Voice Agent</h1>
      <div class="sub">Hold the mic, speak, release. The agent listens, thinks, and talks back.</div>
    </div>
    <select id="lang">
      <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option>
      <option value="sw-KE">Swahili</option><option value="fr-FR">French</option><option value="ha-NG">Hausa</option>
    </select>
    <div class="transcript" id="transcript"></div>
    <div class="button-wrap">
      <div class="mic" id="mic">🎤</div>
      <div class="status" id="status">Hold to speak</div>
    </div>
  </div>
  <script>
    const SYSTEM = "You are a warm, attentive voice companion. Keep replies SHORT — 1-2 sentences — because they'll be spoken aloud. Conversational, not formal. African / developing-world context when natural.";

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById("mic");
    const status = document.getElementById("status");
    const transcript = document.getElementById("transcript");
    const langSel = document.getElementById("lang");
    const history = [];
    let recognition = null;

    function add(cls, text) {
      const t = document.createElement("div"); t.className = "turn " + cls; t.textContent = text;
      transcript.appendChild(t); transcript.scrollTop = transcript.scrollHeight;
    }

    function speak(text) {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langSel.value; u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }

    async function reply(userText) {
      add("user", userText);
      history.push({ role: "user", content: userText });
      status.textContent = "Thinking…";
      try {
        const res = await fetch("/api/build/proxy", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: SYSTEM, messages: history.slice(-8), max_tokens: 200 }),
        });
        const data = await res.json();
        const text = data.content || "I didn't catch that. Try again?";
        history.push({ role: "assistant", content: text });
        add("bot", text);
        status.textContent = "Speaking…";
        speak(text);
        const onEnd = () => { status.textContent = "Hold to speak"; window.speechSynthesis.removeEventListener("end", onEnd); };
        window.speechSynthesis.addEventListener("end", onEnd);
        setTimeout(() => { status.textContent = "Hold to speak"; }, 4000);
      } catch (e) {
        status.textContent = "Error: " + e.message;
      }
    }

    function startListen() {
      if (!SR) { status.textContent = "Voice not supported. Try Chrome."; return; }
      recognition = new SR();
      recognition.lang = langSel.value;
      recognition.continuous = false;
      recognition.interimResults = true;
      let final = "";
      recognition.onresult = (e) => {
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        status.textContent = interim || final || "listening…";
      };
      recognition.onend = () => {
        mic.classList.remove("rec");
        if (final.trim()) reply(final.trim());
        else status.textContent = "Didn't catch anything. Try again.";
      };
      recognition.start();
      mic.classList.add("rec");
      status.textContent = "Listening…";
    }
    function stopListen() { if (recognition) recognition.stop(); }

    let pressed = false;
    mic.addEventListener("pointerdown", () => { pressed = true; startListen(); });
    mic.addEventListener("pointerup", () => { if (pressed) { pressed = false; stopListen(); } });
    mic.addEventListener("pointerleave", () => { if (pressed) { pressed = false; stopListen(); } });
  </script>
</body></html>`,
  },

  {
    id: "rag-agent",
    name: "RAG Agent (knowledge over docs)",
    tagline: "Drop in a doc. Ask the agent questions about it.",
    longDescription: "A simple retrieval-augmented generation agent. Paste any text (policy doc, course notes, contract). The agent retrieves the most relevant chunks and answers grounded in them. Citations included.",
    emoji: "📚",
    kind: "agentic",
    level: "advanced",
    disciplines: ["Law", "Education", "Public Health", "Business"],
    conceptsTouched: ["rag", "embeddings", "chunking", "grounded-answers", "citations"],
    startingPrompt: "A RAG agent. Paste a document. Ask questions. The agent retrieves relevant chunks and cites them. Tweak the chunking strategy or the retrieval scoring at the top of the script.",
    extensionIdeas: [
      "Replace the keyword-based retriever with an embedding-based one (use a small in-browser model)",
      "Let users upload a PDF or .docx",
      "Add a list of multiple documents with a 'which doc?' dropdown",
      "Cache answers to FAQ-style queries",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 800px; margin: 0 auto; padding: 22px 18px; min-height: 100vh; display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: 22px; }
  .sub { color: var(--muted); font-size: 13px; }
  textarea { width: 100%; background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 12px; font-size: 13px; outline: none; font-family: inherit; min-height: 140px; }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; background: var(--surface-2); color: var(--text); padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); outline: none; }
  button { background: var(--accent); color: #000; padding: 12px 22px; border-radius: 12px; font-weight: 600; }
  .answer { background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 14px; line-height: 1.6; }
  .answer h3 { margin: 0 0 8px; font-size: 14px; color: var(--accent); }
  .citation { background: rgba(108,140,255,0.08); border-left: 3px solid var(--indigo, #6c8cff); padding: 8px 10px; border-radius: 6px; font-size: 12px; color: var(--muted); margin-top: 8px; }
  .citation b { color: var(--text); }
</style></head>
<body>
  <div class="app">
    <h1>📚 RAG Agent</h1>
    <p class="sub">1. Paste a document below. 2. Ask anything about it. Grounded answers with citations.</p>
    <div>
      <div class="sub" style="margin-bottom:4px">Document</div>
      <textarea id="doc" placeholder="Paste any text here — a policy, a chapter, a contract, your lecture notes…"></textarea>
    </div>
    <div class="row">
      <input id="q" placeholder="Ask a question about the document" autofocus/>
      <button onclick="ask()" id="askBtn">Ask</button>
    </div>
    <div id="out"></div>
  </div>
  <script>
    // ── chunking: split into ~400-char chunks at sentence boundaries
    function chunk(text) {
      const sents = text.replace(/\\s+/g, " ").split(/(?<=[.!?])\\s+/);
      const out = []; let cur = "";
      for (const s of sents) {
        if ((cur + " " + s).length > 400 && cur) { out.push(cur.trim()); cur = s; }
        else cur += " " + s;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    // ── keyword retriever: BM25-ish lite (tf-idf without idf normalization)
    function retrieve(query, chunks, k = 3) {
      const qTokens = query.toLowerCase().match(/\\w+/g) || [];
      const scored = chunks.map((c, i) => {
        const tokens = c.toLowerCase().match(/\\w+/g) || [];
        const counts = {};
        for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
        let score = 0;
        for (const q of qTokens) if (counts[q]) score += Math.log(1 + counts[q]);
        return { i, c, score };
      });
      return scored.sort((a, b) => b.score - a.score).slice(0, k).filter((x) => x.score > 0);
    }

    async function ask() {
      const doc = document.getElementById("doc").value.trim();
      const q = document.getElementById("q").value.trim();
      if (!doc || !q) { alert("Paste a doc and ask a question first."); return; }
      const btn = document.getElementById("askBtn"); btn.textContent = "Thinking…"; btn.disabled = true;
      try {
        const chunks = chunk(doc);
        const hits = retrieve(q, chunks);
        if (hits.length === 0) {
          document.getElementById("out").innerHTML = '<div class="answer"><h3>No relevant content found</h3><div>The document doesn\\'t seem to contain anything matching your question.</div></div>';
          return;
        }
        const context = hits.map((h, i) => "[" + (i+1) + "] " + h.c).join("\\n\\n");
        const prompt = "Based ONLY on the following excerpts from the document, answer the user's question. Cite the excerpt number in brackets like [1] or [2]. If the excerpts don't contain the answer, say so honestly.\\n\\nEXCERPTS:\\n" + context + "\\n\\nQUESTION: " + q;
        const res = await fetch("/api/build/proxy", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: "You answer questions grounded only in provided excerpts. Cite which excerpt(s) you used.", messages: [{ role: "user", content: prompt }], max_tokens: 600 }),
        });
        const data = await res.json();
        const html = '<div class="answer"><h3>Answer</h3><div>' + (data.content || "(no reply)").replace(/\\[(\\d+)\\]/g, '<b style="color:var(--accent)">[$1]</b>').replace(/\\n/g, "<br>") + '</div>' +
          hits.map((h, i) => '<div class="citation"><b>[' + (i+1) + ']</b> ' + h.c.slice(0, 240).replace(/</g, "&lt;") + (h.c.length > 240 ? "…" : "") + '</div>').join("") +
          '</div>';
        document.getElementById("out").innerHTML = html;
      } catch (e) {
        document.getElementById("out").innerHTML = '<div class="answer">Error: ' + e.message + '</div>';
      } finally {
        btn.textContent = "Ask"; btn.disabled = false;
      }
    }
  </script>
</body></html>`,
  },

  {
    id: "planner-agent",
    name: "Multi-Step Planner Agent",
    tagline: "Give it a goal. It writes a plan and executes step by step.",
    longDescription: "A planning-execution loop. The agent breaks a goal into steps, runs each one (drafting / refining / saving), and shows its work as it goes. Closer to a research assistant or a campaign drafter than a chatbot.",
    emoji: "🎯",
    kind: "agentic",
    level: "advanced",
    disciplines: ["Computer Science", "Business", "Marketing & Sales"],
    conceptsTouched: ["planning-agent", "multi-step", "scratchpad", "chain-of-thought", "execution-loop"],
    startingPrompt: "A planner-executor agent. Give it a goal like 'draft a 30-day launch plan for a tomato cooperative' and watch it: 1) plan the steps, 2) execute each, 3) show you a final compiled output.",
    extensionIdeas: [
      "Let users edit or reorder steps before execution",
      "Add a 'pause / approve' gate between steps for sensitive decisions",
      "Save each plan as JSON so you can re-run later",
      "Add tools (search, calculator, save_note) the executor can call",
    ],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .app { max-width: 880px; margin: 0 auto; padding: 22px 18px; min-height: 100vh; display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 0; font-size: 22px; }
  .sub { color: var(--muted); font-size: 13px; }
  .row { display: flex; gap: 8px; }
  .row input { flex: 1; background: var(--surface-2); color: var(--text); padding: 14px; border-radius: 12px; border: 1px solid var(--border); outline: none; font-size: 15px; }
  button { background: var(--accent); color: #000; padding: 0 24px; border-radius: 12px; font-weight: 700; font-size: 14px; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .plan { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .step { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
  .step:first-child { border-top: 0; padding-top: 0; }
  .step .n { width: 28px; height: 28px; border-radius: 14px; background: var(--surface-2); display: grid; place-items: center; flex-shrink: 0; font-family: monospace; font-size: 12px; color: var(--muted); }
  .step.done .n { background: var(--accent); color: #000; }
  .step.active .n { background: var(--warn); color: #000; }
  .step .body { flex: 1; min-width: 0; }
  .step .title { font-weight: 600; font-size: 14px; }
  .step .output { font-size: 13px; color: var(--muted); margin-top: 6px; white-space: pre-wrap; line-height: 1.6; }
  .final { background: rgba(44,194,149,0.08); border: 1px solid rgba(44,194,149,0.3); border-radius: 16px; padding: 18px; }
  .final h3 { margin: 0 0 10px; color: var(--accent); font-size: 14px; }
  .final .body { white-space: pre-wrap; line-height: 1.7; font-size: 14px; }
</style></head>
<body>
  <div class="app">
    <div>
      <h1>🎯 Planner Agent</h1>
      <p class="sub">Give it a goal. It plans, executes step by step, and compiles a final output.</p>
    </div>
    <div class="row">
      <input id="goal" placeholder="e.g. Draft a 30-day launch plan for a tomato cooperative in Tamale" autofocus/>
      <button id="go" onclick="run()">Plan & execute</button>
    </div>
    <div id="planEl"></div>
    <div id="finalEl"></div>
  </div>
  <script>
    async function callClaude(system, prompt) {
      const res = await fetch("/api/build/proxy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, messages: [{ role: "user", content: prompt }], max_tokens: 1500 }),
      });
      const d = await res.json(); return d.content || "";
    }

    async function run() {
      const goal = document.getElementById("goal").value.trim(); if (!goal) return;
      const btn = document.getElementById("go"); btn.disabled = true;
      document.getElementById("finalEl").innerHTML = "";

      // 1. Plan
      const planText = await callClaude(
        "You produce step-by-step plans. Output ONLY a numbered list of 4-6 concrete, executable steps. No prose around it.",
        "Goal: " + goal + "\\n\\nProduce the plan."
      );
      const steps = planText.split("\\n").map(s => s.replace(/^\\d+[\\.\\)]\\s*/, "").trim()).filter(s => s.length > 0).slice(0, 6);

      const planEl = document.getElementById("planEl");
      planEl.innerHTML = '<div class="plan"><div class="sub" style="margin-bottom:10px">The plan</div>' +
        steps.map((s, i) => '<div class="step" id="step'+i+'"><div class="n">'+(i+1)+'</div><div class="body"><div class="title">'+s+'</div><div class="output" id="out'+i+'"></div></div></div>').join("") +
      '</div>';

      // 2. Execute each step
      const outputs = [];
      for (let i = 0; i < steps.length; i++) {
        const stepEl = document.getElementById("step"+i);
        stepEl.classList.add("active");
        const out = await callClaude(
          "You execute one step of a plan. Be concrete and short. Output the deliverable for this step only — no meta-commentary.",
          "Overall goal: " + goal + "\\n\\nFull plan:\\n" + steps.map((s, idx) => (idx+1) + ". " + s).join("\\n") + "\\n\\nPrevious outputs:\\n" + outputs.map((o, idx) => "Step " + (idx+1) + ": " + o).join("\\n\\n") + "\\n\\nNow execute step " + (i+1) + ": " + steps[i]
        );
        outputs.push(out);
        document.getElementById("out"+i).textContent = out;
        stepEl.classList.remove("active"); stepEl.classList.add("done");
      }

      // 3. Final compile
      const final = await callClaude(
        "You compile a final, polished deliverable from a sequence of partial outputs. Make it cohesive, well-structured, and ready to share. No meta-commentary.",
        "Goal: " + goal + "\\n\\nStep outputs:\\n" + outputs.map((o, i) => "=== Step " + (i+1) + ": " + steps[i] + " ===\\n" + o).join("\\n\\n") + "\\n\\nCompile the final deliverable."
      );
      document.getElementById("finalEl").innerHTML = '<div class="final"><h3>✨ Final deliverable</h3><div class="body">' + final.replace(/</g, "&lt;") + '</div></div>';
      btn.disabled = false;
    }
  </script>
</body></html>`,
  },

  {
    id: "blank-canvas",
    name: "Blank Canvas",
    tagline: "An empty page. Build anything.",
    longDescription: "Start from a clean slate. Describe what you want; Sage writes it.",
    emoji: "✨",
    kind: "tool",
    level: "starter",
    disciplines: [],
    conceptsTouched: [],
    startingPrompt: "Describe what you want to build — anything. I'll write the HTML, CSS, and JS in one self-contained file you can run live in the next panel.",
    extensionIdeas: ["Anything you can imagine."],
    starterCode: `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${baseStyle}
  .center { min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 24px; text-align: center; }
  h1 { font-size: 28px; margin: 0; }
  p { color: var(--muted); max-width: 360px; }
</style></head>
<body>
  <div class="center">
    <h1>✨ Blank canvas</h1>
    <p>Tell Sage what to build over there. The preview shows up here as it writes.</p>
  </div>
</body></html>`,
  },
];

export function getBuildTemplate(id: string) {
  return BUILD_TEMPLATES.find((t) => t.id === id);
}

export function templatesForDiscipline(disciplineName?: string): BuildTemplate[] {
  if (!disciplineName) return BUILD_TEMPLATES;
  const lower = disciplineName.toLowerCase();
  const matched = BUILD_TEMPLATES.filter((t) => t.disciplines.some((d) => lower.includes(d.toLowerCase().split(" ")[0]) || d.toLowerCase().includes(lower.split(" ")[0])));
  const rest = BUILD_TEMPLATES.filter((t) => !matched.includes(t));
  return [...matched, ...rest];
}
