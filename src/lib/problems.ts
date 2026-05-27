export type Problem = {
  id: string;
  title: string;
  region: string;
  sector: "Agriculture" | "Health" | "Energy" | "Education" | "Finance" | "Logistics" | "Climate" | "Governance" | "Water" | "Creative";
  severity: 1 | 2 | 3 | 4 | 5;
  affected: string;
  description: string;
  evidence: string;
  aiAngle: string;
  skillsNeeded: string[];
  exampleVentures?: string[];
};

// Curated from on-the-ground reports, World Bank / UNESCO / WHO data, and
// founder interviews across Sub-Saharan Africa, North Africa, South Asia, and LATAM.
export const PROBLEMS: Problem[] = [
  {
    id: "post-harvest-loss",
    title: "30–40% of smallholder produce rots before reaching market",
    region: "Sub-Saharan Africa",
    sector: "Agriculture",
    severity: 5,
    affected: "33M smallholder farmers across Nigeria, Kenya, Ghana, Uganda, Tanzania",
    description:
      "Smallholder farmers lose a third of their tomatoes, onions, and leafy greens to spoilage between farm gate and market due to lack of cold storage, poor road logistics, and unpredictable demand forecasting.",
    evidence: "AGRA 2023 Africa Food Systems Report; FAO loss tracker shows 37% avg loss for tomatoes in Kano cluster.",
    aiAngle:
      "Vision models on cheap phones can quality-grade produce at the farm gate; demand-forecasting LLMs can match harvest windows to buyer commitments before the crop is picked.",
    skillsNeeded: ["Computer vision", "Mobile-first PWA", "USSD/SMS integration", "Supply-chain ops"],
    exampleVentures: ["ColdHubs (Nigeria)", "Twiga Foods (Kenya)"],
  },
  {
    id: "vernacular-tutoring",
    title: "200:1 student-to-teacher ratios — no real tutoring exists in mother-tongue",
    region: "Pan-African + South Asia",
    sector: "Education",
    severity: 5,
    affected: "120M+ secondary and tertiary students across Yoruba, Twi, Hausa, Swahili, Amharic, Wolof, Zulu, Hindi, Urdu, Bangla speakers",
    description:
      "University classes have 200–600 students per lecturer. Tutoring is unaffordable. Existing AI tutors (Khanmigo, etc.) speak English/French only and assume Silicon Valley context — they don't know what a 'tro-tro' or 'boda boda' is, or how to explain calculus using Ananse the spider stories.",
    evidence: "UNESCO Global Education Monitoring 2024; 78% of African undergrads report 'never had a 1:1 tutoring session.'",
    aiAngle:
      "Foundation LLMs now handle low-resource African languages with retrieval grounding. A culturally-aware tutor can run on a $50 phone in Twi, explaining circuits using a local trotro stop diagram.",
    skillsNeeded: ["LLM fine-tuning", "Low-resource NLP", "Voice/STT", "Curriculum design"],
    exampleVentures: ["Lelapa AI (South Africa)", "Jacaranda Health (Kenya)"],
  },
  {
    id: "credential-trust",
    title: "African online certificates aren't trusted by employers",
    region: "Pan-African",
    sector: "Education",
    severity: 4,
    affected: "11M tertiary graduates / year on the continent",
    description:
      "Employers can't distinguish a serious learner from a certificate mill. Coursera/Udacity certificates from African universities are discounted. Talented self-taught coders in Lagos can't break into remote work.",
    evidence: "Andela 2023 hiring report: <2% of African applicants pass first screen despite documented coursework.",
    aiAngle:
      "Verifiable, AI-proctored skill demonstrations + portfolio of shipped projects with cryptographic provenance can replace paper certificates.",
    skillsNeeded: ["Cryptography", "Workflow design", "Hiring partnerships", "Trust UX"],
  },
  {
    id: "diagnosis-gap",
    title: "Rural clinics diagnose by guesswork — 1 doctor per 25,000 people",
    region: "Sub-Saharan Africa",
    sector: "Health",
    severity: 5,
    affected: "600M people in rural districts",
    description:
      "Community health workers see patients with no diagnostic support. Misdiagnosed malaria, TB, and maternal complications drive preventable deaths. Phones have cameras and connectivity; clinics often don't have lab kits.",
    evidence: "WHO 2024: SSA averages 0.2 physicians per 1,000 vs 3.3 in OECD.",
    aiAngle:
      "Multimodal LLMs interpret rash photos, cough audio, fetal heart strips at a senior-resident level — turning every CHW phone into a triage co-pilot.",
    skillsNeeded: ["Medical AI", "Edge inference", "Regulatory navigation", "Field UX"],
    exampleVentures: ["Ada Health", "Ilara Health (Kenya)"],
  },
  {
    id: "minigrid-design",
    title: "600M Africans without electricity — minigrid design is bespoke and slow",
    region: "Pan-African + South Asia",
    sector: "Energy",
    severity: 5,
    affected: "600M off-grid Africans, 200M off-grid South Asians",
    description:
      "Designing a village solar minigrid takes engineers weeks of CAD, load surveys, financial modeling. Result: deployments crawl while demand explodes.",
    evidence: "IEA Africa Energy Outlook 2024; current deployment rate hits 9% of needed pace.",
    aiAngle:
      "LLM-orchestrated agents can ingest satellite imagery + census data + appliance load curves and produce a buildable minigrid spec + bankable financial model in minutes.",
    skillsNeeded: ["Electrical engineering", "Geospatial AI", "Finance modeling", "Hardware sourcing"],
    exampleVentures: ["Husk Power", "PowerGen Renewable Energy"],
  },
  {
    id: "smb-bookkeeping",
    title: "90% of African SMEs keep no books — invisible to lenders",
    region: "Pan-African",
    sector: "Finance",
    severity: 4,
    affected: "44M micro and small enterprises",
    description:
      "Hairdressers, mama-puts, market traders run cash businesses with no records. Banks can't lend. Owners can't see if they're profitable. Most fail in 3 years.",
    evidence: "IFC MSME Finance Gap 2023: $331B unmet credit demand in SSA.",
    aiAngle:
      "Voice-first WhatsApp bot in pidgin/Swahili captures 'I sold 12 plates of jollof for 200 cedi today' and builds audit-grade books + a credit score automatically.",
    skillsNeeded: ["Conversational AI", "Accounting domain", "Whatsapp Cloud API", "Credit scoring"],
    exampleVentures: ["Sabi", "Moniepoint", "Flutterwave"],
  },
  {
    id: "logistics-last-mile",
    title: "Last-mile delivery costs 4x more in Lagos than London",
    region: "Urban African megacities",
    sector: "Logistics",
    severity: 4,
    affected: "Every e-commerce buyer & seller in Lagos, Nairobi, Cairo, Accra, Kinshasa",
    description:
      "Informal addresses, traffic chaos, theft. Drivers spend 60% of time finding addresses, not driving.",
    evidence: "World Bank Logistics Performance Index 2024; Nigeria ranked 88th.",
    aiAngle:
      "What3words-style + vision-based landmark routing + dynamic batching agents can cut delivery cost 50%.",
    skillsNeeded: ["Geospatial", "Routing optimization", "Mobile dev", "Driver UX"],
    exampleVentures: ["Sendy", "Kobo360"],
  },
  {
    id: "climate-adaptation",
    title: "Smallholders have no early warning for changing rainfall patterns",
    region: "Sahel, Horn of Africa, South Asia",
    sector: "Climate",
    severity: 5,
    affected: "200M climate-vulnerable farmers",
    description:
      "Rainfall is 3 weeks late or 2 months early. Farmers plant on traditional calendars and lose entire seasons. Existing weather services are coarse and broadcast in English.",
    evidence: "IPCC AR6 WG2 Africa chapter; 80% of SSA agriculture is rain-fed.",
    aiAngle:
      "Hyperlocal weather + soil moisture from satellites, fused with on-device AI, delivered as a 30-second voice note in local language: 'Don't plant maize this week.'",
    skillsNeeded: ["Climate science", "Satellite ML", "Voice synthesis", "Cooperative distribution"],
  },
  {
    id: "water-quality",
    title: "1 in 3 Africans drinks unsafe water and has no way to know",
    region: "Pan-African",
    sector: "Water",
    severity: 5,
    affected: "411M people without safe drinking water",
    description:
      "Communities draw from boreholes and streams with no way to test for E. coli, arsenic, fluoride. Test kits cost $40 each and require a lab.",
    evidence: "WHO/UNICEF JMP 2024.",
    aiAngle:
      "Phone-camera colorimetric strips + computer vision can give a $0.10 water-quality reading. AI-routed alerts to public health when contamination spikes.",
    skillsNeeded: ["Computer vision", "Public health", "Hardware design", "Community ops"],
  },
  {
    id: "creative-monetization",
    title: "African creators earn 1/40th of US peers for equal work",
    region: "Pan-African",
    sector: "Creative",
    severity: 3,
    affected: "5M musicians, designers, writers, video producers",
    description:
      "Streaming royalties, copyright enforcement, and brand-deal infrastructure don't exist for most African creators. Talent flows offshore for pennies.",
    evidence: "UNESCO Re|Shaping Cultural Policies 2024.",
    aiAngle:
      "AI-powered rights registry + automated brand-deal matching + generative tools that 10x output quality.",
    skillsNeeded: ["Rights management", "Marketplace dynamics", "Generative AI", "Brand sales"],
  },
  {
    id: "governance-procurement",
    title: "$148B/year lost to procurement opacity across African governments",
    region: "Pan-African",
    sector: "Governance",
    severity: 4,
    affected: "All citizens — public services degraded",
    description:
      "Tender awards happen in opaque PDFs scattered across 54 government portals. Watchdogs can't track who got what for how much.",
    evidence: "Open Contracting Partnership 2024; AU Anti-Corruption Strategy review.",
    aiAngle:
      "LLM agents scrape, normalize, and flag suspicious tenders in real time — public dashboards in 12 African languages.",
    skillsNeeded: ["Civic tech", "Document AI", "Legal compliance", "Investigative journalism"],
  },
  {
    id: "stem-lab-access",
    title: "Most African STEM undergrads never run a real wet/electronics lab",
    region: "Pan-African",
    sector: "Education",
    severity: 4,
    affected: "8M STEM undergraduates",
    description:
      "Lab equipment is broken, scarce, or shared 60-to-1. Students 'learn' chemistry by reading textbooks. Graduates can't operate equipment day one of a job.",
    evidence: "Royal Society Africa Capacity Building Initiative 2023.",
    aiAngle:
      "Browser-based physics-accurate virtual labs (Labster-class) + AR-projected experiments via cheap Android phones + AI lab partner that catches mistakes.",
    skillsNeeded: ["WebGL/WebGPU", "Physics simulation", "Pedagogy", "AR"],
  },
];

export function getProblem(id: string) {
  return PROBLEMS.find((p) => p.id === id);
}
