// Discipline taxonomy modeled on real African university structures (KNUST, UG, UNILAG, UoN, Wits, Makerere, UCT, AAU, etc.).
// Each discipline points to relevant tracks, agents, problem sectors, and AI opportunities.

export type Program = {
  id: string;
  name: string;
  level: "Undergraduate" | "Postgraduate" | "Both";
};

export type Department = {
  id: string;
  name: string;
  programs: Program[];

  // Recommendation mappings
  relevantSectors: string[]; // matches PROBLEMS.sector
  relevantTracks: string[]; // matches TRACKS.id
  relevantAgents: string[]; // matches AGENTS.id
  relevantProblemIds?: string[]; // explicit Problem Hub ids
  relevantMentorExpertise: string[]; // matches Mentor.expertise

  // The 3 most leveraged AI opportunities for this discipline
  aiOpportunities: { title: string; why: string }[];

  // Local-context examples this discipline cares about
  localExamples: string[];

  // Career roles this discipline produces (for placement copy)
  careerRoles: string[];

  // Suggested first venture idea
  suggestedVentureSeed: string;
};

export type School = {
  id: string;
  name: string;
  icon: string;
  color: "emerald" | "amber" | "rust" | "indigo";
  departments: Department[];
};

export const SCHOOLS: School[] = [
  {
    id: "engineering",
    name: "College of Engineering",
    icon: "⚙️",
    color: "indigo",
    departments: [
      {
        id: "agric-eng",
        name: "Agricultural Engineering",
        programs: [
          { id: "bsc-agric", name: "BSc Agricultural Engineering", level: "Undergraduate" },
          { id: "msc-soil-water", name: "MSc Soil & Water Engineering", level: "Postgraduate" },
          { id: "msc-postharvest", name: "MSc Post-harvest Technology", level: "Postgraduate" },
        ],
        relevantSectors: ["Agriculture", "Climate", "Water"],
        relevantTracks: ["stem-intuition", "coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["market-sizing", "competitive-tear", "financial-model", "test-rig", "interview-synthesizer"],
        relevantProblemIds: ["post-harvest-loss", "climate-adaptation", "water-quality"],
        relevantMentorExpertise: ["Agribusiness", "Food systems", "Impact investing", "Agritech hardware"],
        aiOpportunities: [
          { title: "Vision-based crop disease detection on $50 phones", why: "FastViT/MobileNet now reach senior-agronomist accuracy. Your domain knowledge picks the right disease set." },
          { title: "Solar-powered cold-chain controllers", why: "Embedded ML + power-aware scheduling — your thermo + circuits background is rare and valuable." },
          { title: "Hyperlocal climate forecasting in mother-tongue voice", why: "Combine ag-met models with TTS. Your domain says what farmers actually need to hear." },
        ],
        localExamples: ["Tomato co-op in Tamale losing 4 crates/wk", "Cocoa farmer in Bonsu Nkwanta", "Cassava grower battling mosaic disease in Kogi"],
        careerRoles: ["Field engineer", "Agritech founder", "AGRA program officer", "Food-systems consultant"],
        suggestedVentureSeed: "Solar microcold storage with vision-graded produce sorting for tomato/onion co-ops in your home region.",
      },
      {
        id: "mech-eng",
        name: "Mechanical Engineering",
        programs: [
          { id: "bsc-mech", name: "BSc Mechanical Engineering", level: "Undergraduate" },
          { id: "msc-manufacturing", name: "MSc Manufacturing Systems", level: "Postgraduate" },
          { id: "msc-energy", name: "MSc Energy Systems", level: "Postgraduate" },
        ],
        relevantSectors: ["Energy", "Logistics", "Climate", "Agriculture"],
        relevantTracks: ["stem-intuition", "math-mastery", "ai-for-your-field", "venture-building"],
        relevantAgents: ["financial-model", "test-rig", "patent-search", "competitive-tear", "regulator-prep"],
        relevantProblemIds: ["minigrid-design", "logistics-last-mile", "climate-adaptation"],
        relevantMentorExpertise: ["Off-grid energy", "Agritech hardware", "Engineering culture"],
        aiOpportunities: [
          { title: "AI-orchestrated minigrid design", why: "Satellite + census + load curves → buildable BoM + bankable model in minutes. 100× faster than CAD-by-hand." },
          { title: "Predictive maintenance for boda-boda fleets", why: "Cheap IMU + on-device anomaly detection saves 30%+ in repair costs." },
          { title: "Cold-chain hardware controllers", why: "Embedded systems with power-aware scheduling for off-grid contexts." },
        ],
        localExamples: ["NEPA outage patterns in Aba", "Trotro maintenance economics in Accra", "Rural minigrid in Northern Nigeria"],
        careerRoles: ["Mechanical design engineer", "Energy-systems founder", "Manufacturing operations lead", "Hardware advisor"],
        suggestedVentureSeed: "AI-driven minigrid feasibility tool that turns a satellite image into a deployable spec in 15 minutes.",
      },
      {
        id: "elec-eng",
        name: "Electrical & Electronic Engineering",
        programs: [
          { id: "bsc-eee", name: "BSc Electrical & Electronic Engineering", level: "Undergraduate" },
          { id: "msc-power", name: "MSc Power Systems", level: "Postgraduate" },
          { id: "msc-comms", name: "MSc Communications", level: "Postgraduate" },
        ],
        relevantSectors: ["Energy", "Logistics"],
        relevantTracks: ["stem-intuition", "math-mastery", "coding-craft", "ai-for-your-field"],
        relevantAgents: ["code-review", "patent-search", "financial-model", "test-rig"],
        relevantProblemIds: ["minigrid-design", "water-quality"],
        relevantMentorExpertise: ["Off-grid energy", "Engineering culture", "Open banking"],
        aiOpportunities: [
          { title: "Smart-meter ML for theft detection", why: "Anomaly detection in load curves catches losses utilities currently estimate at 30%." },
          { title: "Low-bandwidth USSD-IoT bridges", why: "When 4G isn't there, 2G+USSD is. Your radio depth is the wedge." },
          { title: "Edge-AI on solar-powered devices", why: "Power-aware inference for off-grid deployments." },
        ],
        localExamples: ["NEPA load shedding in Lagos", "Off-grid clinics in Karamoja", "Tanzanian solar pay-as-you-go"],
        careerRoles: ["Power engineer", "Hardware founder", "Telecoms engineer", "Embedded ML engineer"],
        suggestedVentureSeed: "Pay-as-you-go smart meter that detects theft and shaves 30% off utility losses.",
      },
      {
        id: "civil-eng",
        name: "Civil Engineering",
        programs: [
          { id: "bsc-civil", name: "BSc Civil Engineering", level: "Undergraduate" },
          { id: "msc-structural", name: "MSc Structural Engineering", level: "Postgraduate" },
          { id: "msc-transport", name: "MSc Transportation Engineering", level: "Postgraduate" },
        ],
        relevantSectors: ["Water", "Logistics", "Climate", "Governance"],
        relevantTracks: ["stem-intuition", "math-mastery", "ai-for-your-field"],
        relevantAgents: ["market-sizing", "regulator-prep", "competitive-tear"],
        relevantProblemIds: ["water-quality", "logistics-last-mile", "governance-procurement"],
        relevantMentorExpertise: ["Off-grid energy", "Impact investing"],
        aiOpportunities: [
          { title: "Satellite-based informal settlement mapping", why: "Your geomatics depth + open ML = real input to city planners who currently fly blind." },
          { title: "AI-aided pothole/road-condition triage", why: "Phone-camera + cheap GPS becomes the cheapest road inventory ever." },
          { title: "Water network leak detection from pressure logs", why: "ML on telemetry catches non-revenue water utilities lose 40%+ to." },
        ],
        localExamples: ["Lagos flood drainage", "Kampala potholes", "Nairobi non-revenue water"],
        careerRoles: ["Site engineer", "Urban-tech founder", "Civic-tech engineer", "Infrastructure consultant"],
        suggestedVentureSeed: "Phone-camera-based road inventory app for African municipalities — 1/100th the cost of consultant surveys.",
      },
      {
        id: "cse",
        name: "Computer Science & Engineering",
        programs: [
          { id: "bsc-cs", name: "BSc Computer Science", level: "Undergraduate" },
          { id: "msc-ai", name: "MSc Artificial Intelligence", level: "Postgraduate" },
          { id: "msc-software", name: "MSc Software Engineering", level: "Postgraduate" },
        ],
        relevantSectors: ["Finance", "Health", "Education", "Logistics", "Governance"],
        relevantTracks: ["coding-craft", "math-mastery", "ai-for-your-field", "venture-building"],
        relevantAgents: ["code-review", "patent-search", "interview-synthesizer", "user-persona", "lp-writer", "test-rig"],
        relevantProblemIds: ["smb-bookkeeping", "vernacular-tutoring", "credential-trust", "logistics-last-mile"],
        relevantMentorExpertise: ["Fintech", "Engineering culture", "AI/ML", "Open banking", "Marketplace"],
        aiOpportunities: [
          { title: "Foundation models in low-resource African languages", why: "Twi, Yoruba, Hausa, Swahili. The frontier is wide open — Lelapa, Awarri are just starting." },
          { title: "Voice-first SME bookkeeping over WhatsApp", why: "44M unbanked SMEs. Conversation-as-OS bypasses literacy + UX friction." },
          { title: "Verifiable, on-chain skill credentials", why: "Employers don't trust African certificates. Cryptographic + portfolio-anchored fixes this." },
        ],
        localExamples: ["Pidgin-speaking trader in Lagos", "Swahili-only farmer in Dodoma", "Multilingual call-center QA"],
        careerRoles: ["Software engineer", "ML engineer", "Founder/CTO", "Open-source contributor"],
        suggestedVentureSeed: "WhatsApp voice-bot in Pidgin/Swahili that does double-entry bookkeeping for street vendors.",
      },
    ],
  },
  {
    id: "health",
    name: "School of Medicine & Health Sciences",
    icon: "🩺",
    color: "rust",
    departments: [
      {
        id: "medicine",
        name: "Medicine & Surgery",
        programs: [
          { id: "mbchb", name: "MBChB / MBBS", level: "Undergraduate" },
          { id: "md", name: "MD / Specialty Residency", level: "Postgraduate" },
        ],
        relevantSectors: ["Health"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["interview-synthesizer", "regulator-prep", "test-rig", "diligence-prep"],
        relevantProblemIds: ["diagnosis-gap", "vernacular-tutoring"],
        relevantMentorExpertise: ["Healthtech", "Public-sector", "Medical AI"],
        aiOpportunities: [
          { title: "Multimodal AI for community health workers", why: "Photo+voice triage on a $50 phone. Your clinical judgment trains the right ground truth." },
          { title: "Maternal mortality early-warning", why: "375 maternal deaths per 100k in SSA. Wearable + AI risk scores during pregnancy save lives." },
          { title: "TB / malaria image-based screening", why: "Phone-camera microscopy + ML matches senior microbiologist accuracy in studies." },
        ],
        localExamples: ["Rural CHW in Karamoja", "Maternal ward in Mulago", "Misdiagnosed malaria in Edo state"],
        careerRoles: ["Clinician", "Public health official", "Healthtech founder", "Medical AI engineer"],
        suggestedVentureSeed: "Voice-driven triage co-pilot for CHWs in your home region, trained on local disease patterns.",
      },
      {
        id: "pharmacy",
        name: "Pharmacy",
        programs: [
          { id: "pharmd", name: "PharmD / BPharm", level: "Undergraduate" },
          { id: "msc-pharm", name: "MSc Clinical Pharmacy", level: "Postgraduate" },
        ],
        relevantSectors: ["Health", "Logistics"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["competitive-tear", "regulator-prep", "test-rig"],
        relevantProblemIds: ["diagnosis-gap"],
        relevantMentorExpertise: ["Healthtech", "Supply chain"],
        aiOpportunities: [
          { title: "Counterfeit drug detection via packaging vision", why: "30% of African meds are counterfeit. Phone-camera detection scales fast." },
          { title: "Drug-interaction checker in local languages", why: "Polypharmacy errors kill. Voice-driven check at the chemist counter saves lives." },
          { title: "Cold-chain integrity monitoring for vaccines", why: "Last-mile temperature breaches are the silent killer of immunization programs." },
        ],
        localExamples: ["Patent medicine vendor in Aba", "Vaccine cold-chain in Yaoundé", "Polypharmacy at Korle-Bu"],
        careerRoles: ["Clinical pharmacist", "Pharmacovigilance lead", "Pharma founder", "Regulatory affairs"],
        suggestedVentureSeed: "Counterfeit-drug detection app for patent medicine vendors — scan packaging, get a verdict.",
      },
      {
        id: "public-health",
        name: "Public Health & Epidemiology",
        programs: [
          { id: "bsph", name: "BSc Public Health", level: "Undergraduate" },
          { id: "mph", name: "Master of Public Health", level: "Postgraduate" },
          { id: "phd-epi", name: "PhD Epidemiology", level: "Postgraduate" },
        ],
        relevantSectors: ["Health", "Water", "Governance"],
        relevantTracks: ["math-mastery", "coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["market-sizing", "regulator-prep", "competitive-tear"],
        relevantProblemIds: ["diagnosis-gap", "water-quality"],
        relevantMentorExpertise: ["Healthtech", "Public-sector", "Climate policy"],
        aiOpportunities: [
          { title: "Outbreak prediction from telco+mobility data", why: "Anonymized phone data + ML beats CDC-style surveillance in low-resource settings." },
          { title: "WaSH risk maps from satellite + field reporting", why: "Where to put the next borehole becomes a data question, not a politics question." },
          { title: "Wearable AI for chronic-disease management", why: "$50 BP cuff + ML coach beats 1 cardiologist per 100k catchment." },
        ],
        localExamples: ["Cholera outbreak in Lusaka", "NCD burden in Cape Town townships", "Vaccine hesitancy in Kano"],
        careerRoles: ["Epidemiologist", "Program officer", "Health-data scientist", "Healthtech founder"],
        suggestedVentureSeed: "Outbreak-warning dashboard for district health officers, fed by anonymized mobility + clinic reports.",
      },
      {
        id: "nursing",
        name: "Nursing & Midwifery",
        programs: [
          { id: "bsn", name: "BSc Nursing", level: "Undergraduate" },
          { id: "msn", name: "MSc Advanced Practice Nursing", level: "Postgraduate" },
        ],
        relevantSectors: ["Health"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["interview-synthesizer", "test-rig", "user-persona"],
        relevantProblemIds: ["diagnosis-gap"],
        relevantMentorExpertise: ["Healthtech"],
        aiOpportunities: [
          { title: "Maternal monitoring decision-support", why: "Nurse-midwives at the frontlines. Voice-driven CTG interpretation saves babies." },
          { title: "Discharge-planning AI for understaffed wards", why: "Cuts re-admission and frees nurses for direct care." },
          { title: "Trauma triage assistant for rural emergency rooms", why: "Your clinical pattern recognition + AI = consistent triage with zero training overhead." },
        ],
        localExamples: ["Maternal ward in Bugando", "Trauma bay in JOSH", "Community nurse in Wakiso"],
        careerRoles: ["Clinical nurse", "Nurse-leader founder", "Public health officer", "Healthtech product manager"],
        suggestedVentureSeed: "Voice-driven CTG (fetal monitor) interpreter for maternity wards run by midwives.",
      },
    ],
  },
  {
    id: "business",
    name: "School of Business & Economics",
    icon: "💼",
    color: "amber",
    departments: [
      {
        id: "finance",
        name: "Finance & Banking",
        programs: [
          { id: "bba-fin", name: "BBA / BCom Finance", level: "Undergraduate" },
          { id: "msc-fin", name: "MSc Finance", level: "Postgraduate" },
          { id: "mba", name: "MBA", level: "Postgraduate" },
        ],
        relevantSectors: ["Finance"],
        relevantTracks: ["math-mastery", "coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["financial-model", "diligence-prep", "investor-email", "market-sizing"],
        relevantProblemIds: ["smb-bookkeeping", "credential-trust"],
        relevantMentorExpertise: ["Fintech", "Series A-C fundraising", "Series B-C fundraising", "Mobile money"],
        aiOpportunities: [
          { title: "Alternative credit scoring from M-Pesa flows", why: "44M unbanked SMEs. Behavioral data > bureaus that don't have them." },
          { title: "Cross-border FX hedging for diaspora flows", why: "Volatility eats remittance value. ML-driven netting saves billions." },
          { title: "Automated KYC for low-literacy users via voice", why: "Account opening at the speed of conversation in Pidgin/Swahili." },
        ],
        localExamples: ["M-Pesa agent in Kibera", "Hairdresser-microloan in Tema", "Diaspora remittance to Bulawayo"],
        careerRoles: ["Investment analyst", "Fintech founder", "VC associate", "Risk manager"],
        suggestedVentureSeed: "Behavioral credit-scoring engine for African mobile-money SMEs.",
      },
      {
        id: "marketing",
        name: "Marketing & Sales",
        programs: [
          { id: "bba-mkt", name: "BBA Marketing", level: "Undergraduate" },
          { id: "msc-mkt", name: "MSc Marketing Analytics", level: "Postgraduate" },
        ],
        relevantSectors: ["Finance", "Creative", "Logistics"],
        relevantTracks: ["coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["lp-writer", "user-persona", "press-release", "brand-kit"],
        relevantProblemIds: ["creative-monetization", "smb-bookkeeping"],
        relevantMentorExpertise: ["Marketplace dynamics", "Talent platforms"],
        aiOpportunities: [
          { title: "Multilingual content engines for African creators", why: "Translate + adapt with cultural nuance. Your marketing instinct picks what travels." },
          { title: "WhatsApp commerce automation", why: "B2C in Africa starts on WhatsApp. Conversational checkout and re-engagement are gold." },
          { title: "Influencer-fraud detection", why: "Brands burn millions on bot-padded creators. ML on engagement timing reveals fakes." },
        ],
        localExamples: ["Tomato-seller WhatsApp catalog", "Afrobeats music distribution", "FMCG brand entering Lusaka"],
        careerRoles: ["Brand manager", "Growth marketer", "Marketplace founder", "Creator-economy operator"],
        suggestedVentureSeed: "WhatsApp commerce stack for African D2C brands — catalog, checkout, fulfillment in one bot.",
      },
      {
        id: "economics",
        name: "Economics & Development Studies",
        programs: [
          { id: "ba-econ", name: "BA Economics", level: "Undergraduate" },
          { id: "msc-dev-econ", name: "MSc Development Economics", level: "Postgraduate" },
          { id: "phd-econ", name: "PhD Economics", level: "Postgraduate" },
        ],
        relevantSectors: ["Finance", "Governance", "Agriculture"],
        relevantTracks: ["math-mastery", "coding-craft", "ai-for-your-field"],
        relevantAgents: ["market-sizing", "competitive-tear", "go-no-go"],
        relevantProblemIds: ["governance-procurement", "smb-bookkeeping", "climate-adaptation"],
        relevantMentorExpertise: ["Impact investing", "Climate policy"],
        aiOpportunities: [
          { title: "Real-time economic indicators from satellite + receipts", why: "Africa's GDP is famously mismeasured. Alt-data closes the gap." },
          { title: "Causal-inference tooling for policy experiments", why: "Most African policy is untested. Cheap experimentation tools democratize evidence." },
          { title: "Cash-transfer targeting via mobile-data signatures", why: "GiveDirectly is just the start. ML beats geographic blanket-targeting." },
        ],
        localExamples: ["Cash transfers in Turkana", "Free-trade impact in Kigali", "Inflation in Khartoum"],
        careerRoles: ["Economist", "Policy advisor", "Impact-fund analyst", "Research-to-policy founder"],
        suggestedVentureSeed: "Satellite-based real-time GDP nowcasting service for African finance ministries.",
      },
    ],
  },
  {
    id: "law",
    name: "School of Law",
    icon: "⚖️",
    color: "indigo",
    departments: [
      {
        id: "law",
        name: "Law",
        programs: [
          { id: "llb", name: "LLB", level: "Undergraduate" },
          { id: "llm", name: "LLM", level: "Postgraduate" },
          { id: "phd-law", name: "PhD / SJD Law", level: "Postgraduate" },
        ],
        relevantSectors: ["Governance", "Finance"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["regulator-prep", "patent-search", "diligence-prep"],
        relevantProblemIds: ["governance-procurement", "vernacular-tutoring", "credential-trust"],
        relevantMentorExpertise: ["Digital policy", "Regulatory navigation", "Public-sector"],
        aiOpportunities: [
          { title: "Multilingual legal triage bots", why: "Access to justice in Twi/Hausa/Yoruba where 1 lawyer serves 30k+ people." },
          { title: "Contract review and redlining in seconds", why: "Junior-associate-level review at sub-$1/contract opens a giant SME market." },
          { title: "Case-law RAG with African jurisprudence", why: "Existing tools cite US/UK cases. The continent needs its own corpus surfaced." },
        ],
        localExamples: ["Tenant dispute in Maputo", "Land claim in Kakuma", "Small-claims dispute in Tema"],
        careerRoles: ["Litigation associate", "Legaltech founder", "Public-interest lawyer", "Compliance officer"],
        suggestedVentureSeed: "Twi/Pidgin legal-triage chatbot that tells a citizen what their rights are and where to go.",
      },
    ],
  },
  {
    id: "humanities",
    name: "School of Humanities & Social Sciences",
    icon: "📚",
    color: "amber",
    departments: [
      {
        id: "education",
        name: "Education",
        programs: [
          { id: "bed", name: "BEd / Bachelor of Education", level: "Undergraduate" },
          { id: "med", name: "Master of Education", level: "Postgraduate" },
          { id: "phd-edu", name: "PhD Education", level: "Postgraduate" },
        ],
        relevantSectors: ["Education"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["user-persona", "interview-synthesizer", "lp-writer"],
        relevantProblemIds: ["vernacular-tutoring", "stem-lab-access", "credential-trust"],
        relevantMentorExpertise: ["Edtech", "Cohort design"],
        aiOpportunities: [
          { title: "1:1 tutors in mother-tongue languages", why: "200:1 student-teacher ratios are the norm. Personalized practice is the unlock." },
          { title: "Teacher-assistant agents for grading + feedback", why: "Free teachers from grading; they spend time on the relational work no AI can do." },
          { title: "Adaptive curricula for under-resourced schools", why: "Standard pacing fails 60% of African students. Adaptive routes fix this without new teachers." },
        ],
        localExamples: ["Year-1 calc lecturer with 412 students at UNILAG", "Primary teacher in Karamoja with no textbooks", "Rural tech-class in Bolgatanga"],
        careerRoles: ["Teacher", "Edtech founder", "Curriculum designer", "EdTech advisor"],
        suggestedVentureSeed: "A Twi/Yoruba/Hausa-speaking math tutor that runs on Android Go and works offline-tolerant.",
      },
      {
        id: "history",
        name: "History & African Studies",
        programs: [
          { id: "ba-history", name: "BA History", level: "Undergraduate" },
          { id: "ma-african-studies", name: "MA African Studies", level: "Postgraduate" },
        ],
        relevantSectors: ["Creative", "Education", "Governance"],
        relevantTracks: ["ai-for-your-field", "venture-building"],
        relevantAgents: ["user-persona", "press-release", "brand-kit"],
        relevantProblemIds: ["creative-monetization", "vernacular-tutoring"],
        relevantMentorExpertise: ["Edtech", "Creative economy"],
        aiOpportunities: [
          { title: "Oral history archiving with AI transcription", why: "Elder generations are dying. Voice→text→structured archive at scale preserves memory." },
          { title: "Generative storytelling grounded in local mythology", why: "Anansi, Sundiata, Mwindo — your domain says what's authentic vs appropriated." },
          { title: "Heritage-tourism digital experiences", why: "AR/VR layers on Cape Coast, Lalibela, Great Zimbabwe — your scholarship picks the truths to tell." },
        ],
        localExamples: ["Ghanaian Anansi stories archive", "Yoruba oriki documentation", "Liberation history in Zimbabwe"],
        careerRoles: ["Researcher", "Heritage entrepreneur", "Museum curator", "Documentary producer"],
        suggestedVentureSeed: "AI-aided oral-history archive that captures elder voices in their language and makes them searchable.",
      },
      {
        id: "psychology",
        name: "Psychology",
        programs: [
          { id: "bsc-psych", name: "BSc Psychology", level: "Undergraduate" },
          { id: "msc-clinical", name: "MSc Clinical Psychology", level: "Postgraduate" },
        ],
        relevantSectors: ["Health", "Education"],
        relevantTracks: ["math-mastery", "ai-for-your-field"],
        relevantAgents: ["user-persona", "interview-synthesizer", "test-rig"],
        relevantProblemIds: ["diagnosis-gap", "vernacular-tutoring"],
        relevantMentorExpertise: ["Healthtech"],
        aiOpportunities: [
          { title: "Culturally-grounded mental-health chatbots", why: "Western therapy frameworks don't translate. Local-context CBT is a wide-open frontier." },
          { title: "Behavioral analytics for learning platforms", why: "What you know about motivation + retention is exactly what edtech needs." },
          { title: "Workplace well-being AI for African corporates", why: "Burnout is a rising B2B problem. Localized interventions are valuable." },
        ],
        localExamples: ["Post-conflict trauma in Goma", "Urban anxiety in Lagos professionals", "Adolescent counseling in Nairobi"],
        careerRoles: ["Clinical psychologist", "Mental health founder", "UX researcher", "Behavioral economist"],
        suggestedVentureSeed: "Localized mental-health chatbot for African professionals, in Pidgin/English/French.",
      },
    ],
  },
  {
    id: "sciences",
    name: "College of Pure & Applied Sciences",
    icon: "🔬",
    color: "emerald",
    departments: [
      {
        id: "biology",
        name: "Biological Sciences",
        programs: [
          { id: "bsc-bio", name: "BSc Biology / Zoology / Botany", level: "Undergraduate" },
          { id: "msc-microbio", name: "MSc Microbiology", level: "Postgraduate" },
        ],
        relevantSectors: ["Health", "Agriculture", "Climate"],
        relevantTracks: ["stem-intuition", "math-mastery", "ai-for-your-field", "venture-building"],
        relevantAgents: ["patent-search", "test-rig", "competitive-tear"],
        relevantProblemIds: ["diagnosis-gap", "water-quality", "climate-adaptation"],
        relevantMentorExpertise: ["Healthtech", "Agribusiness"],
        aiOpportunities: [
          { title: "Phone-camera microscopy for malaria/TB", why: "Cheap optics + ML reach diagnostic-grade accuracy. Your bio depth labels the data." },
          { title: "Biodiversity monitoring with bioacoustics", why: "Audio + ML identifies species at scale. Conservation funding loves measurable outcomes." },
          { title: "Soil-microbiome diagnostics for smallholders", why: "Cheap soil tests + ML recommend exact inputs. Yield jumps follow." },
        ],
        localExamples: ["Cassava mosaic disease in Kogi", "Malaria mapping in Eastern Uganda", "Soil testing for cocoa farmers"],
        careerRoles: ["Lab scientist", "Biotech founder", "Conservation tech engineer", "AgroTech advisor"],
        suggestedVentureSeed: "Phone-microscope malaria diagnostic kit — $2 hardware, ML-graded, CHW-friendly.",
      },
      {
        id: "chemistry",
        name: "Chemistry",
        programs: [
          { id: "bsc-chem", name: "BSc Chemistry", level: "Undergraduate" },
          { id: "msc-anchem", name: "MSc Analytical Chemistry", level: "Postgraduate" },
        ],
        relevantSectors: ["Water", "Health", "Agriculture"],
        relevantTracks: ["stem-intuition", "math-mastery", "ai-for-your-field"],
        relevantAgents: ["patent-search", "test-rig"],
        relevantProblemIds: ["water-quality", "diagnosis-gap"],
        relevantMentorExpertise: ["Healthtech", "Agribusiness"],
        aiOpportunities: [
          { title: "Colorimetric water-quality kits + phone vision", why: "$0.10 strip + phone camera = E. coli / fluoride / arsenic readout for any borehole." },
          { title: "Counterfeit fertilizer detection", why: "30% of fertilizer sold is fake. Spectroscopy + ML catches it at the point of sale." },
          { title: "Drug-purity scanning for chemists", why: "Pharmacy operators need quick verification. Handheld + ML." },
        ],
        localExamples: ["Borehole testing in Malawi", "Fertilizer fraud in Nigeria", "Drug counterfeit in Aba"],
        careerRoles: ["Analytical chemist", "Water-tech founder", "QA lead", "Pharma scientist"],
        suggestedVentureSeed: "Colorimetric strip + phone-vision water quality tester for $1, deployable by community health workers.",
      },
      {
        id: "math",
        name: "Mathematics & Statistics",
        programs: [
          { id: "bsc-math", name: "BSc Mathematics / Statistics", level: "Undergraduate" },
          { id: "msc-stats", name: "MSc Statistics / Data Science", level: "Postgraduate" },
        ],
        relevantSectors: ["Finance", "Health", "Climate", "Logistics"],
        relevantTracks: ["math-mastery", "coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["financial-model", "test-rig", "code-review", "market-sizing"],
        relevantProblemIds: ["smb-bookkeeping", "climate-adaptation", "logistics-last-mile"],
        relevantMentorExpertise: ["Engineering culture", "Fintech"],
        aiOpportunities: [
          { title: "Optimization for logistics on African roads", why: "Last-mile in Lagos is a math problem with poor tools. Your OR depth ships value." },
          { title: "Causal inference for development programs", why: "RCT-graded answers without RCT prices. Funders love measurable impact." },
          { title: "Statistical surveillance for outbreaks", why: "Bayesian early-warning beats CDC-style hindcasting." },
        ],
        localExamples: ["Lagos delivery routing", "Cash-transfer impact in Turkana", "Cholera surveillance"],
        careerRoles: ["Data scientist", "Quant analyst", "Research-to-product founder", "ML engineer"],
        suggestedVentureSeed: "OR-driven routing optimizer for African last-mile delivery — cuts delivery cost 50%.",
      },
    ],
  },
  {
    id: "agric",
    name: "College of Agriculture & Natural Resources",
    icon: "🌾",
    color: "emerald",
    departments: [
      {
        id: "crop-science",
        name: "Crop Science & Horticulture",
        programs: [
          { id: "bsc-crops", name: "BSc Crop Science", level: "Undergraduate" },
          { id: "msc-agronomy", name: "MSc Agronomy", level: "Postgraduate" },
        ],
        relevantSectors: ["Agriculture", "Climate"],
        relevantTracks: ["stem-intuition", "ai-for-your-field", "venture-building"],
        relevantAgents: ["market-sizing", "test-rig", "interview-synthesizer"],
        relevantProblemIds: ["post-harvest-loss", "climate-adaptation"],
        relevantMentorExpertise: ["Agribusiness", "Food systems"],
        aiOpportunities: [
          { title: "Vision-based crop disease detection", why: "Your domain knowledge tells the model what to look for." },
          { title: "Variety-trial dashboards for breeders", why: "Marker-assisted breeding tools accelerate cassava, sorghum, millet development." },
          { title: "Precision-input recommendations from soil + weather", why: "What/when/how-much, delivered as a voice note." },
        ],
        localExamples: ["Cassava mosaic in Kogi", "Cocoa swollen shoot in Western Ghana", "Maize lethal necrosis in Kenya"],
        careerRoles: ["Agronomist", "Breeder", "Agritech founder", "AGRA program officer"],
        suggestedVentureSeed: "Voice-note advisory service for smallholders, grounded in local soil + weather data.",
      },
      {
        id: "animal-science",
        name: "Animal Science / Veterinary",
        programs: [
          { id: "bsc-animal", name: "BSc Animal Science", level: "Undergraduate" },
          { id: "dvm", name: "DVM Veterinary Medicine", level: "Both" },
        ],
        relevantSectors: ["Agriculture", "Health"],
        relevantTracks: ["ai-for-your-field"],
        relevantAgents: ["competitive-tear", "test-rig", "interview-synthesizer"],
        relevantProblemIds: ["climate-adaptation"],
        relevantMentorExpertise: ["Agribusiness", "Healthtech"],
        aiOpportunities: [
          { title: "Phone-camera mastitis detection for dairy", why: "Photo + ML catches infection before milk yield drops." },
          { title: "Livestock-disease surveillance via SMS reports", why: "Outbreak alerts from kraal to ministry in hours, not weeks." },
          { title: "Vaccine cold-chain integrity for vets", why: "Same problem as human vaccines; smaller market but high-leverage." },
        ],
        localExamples: ["Pastoralist herds in Turkana", "Poultry hatcheries in Ibadan", "Rift Valley dairy"],
        careerRoles: ["Veterinarian", "Livestock-tech founder", "Animal nutritionist", "Field epidemiologist"],
        suggestedVentureSeed: "Mobile dairy clinic + AI mastitis detection for smallholder dairy cooperatives.",
      },
    ],
  },
  {
    id: "creative",
    name: "School of Design & Creative Arts",
    icon: "🎨",
    color: "rust",
    departments: [
      {
        id: "design",
        name: "Industrial / Graphic Design",
        programs: [
          { id: "bdes", name: "BA / BDes Design", level: "Undergraduate" },
          { id: "mdes", name: "MA Design", level: "Postgraduate" },
        ],
        relevantSectors: ["Creative", "Education"],
        relevantTracks: ["coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["brand-kit", "lp-writer", "user-persona"],
        relevantProblemIds: ["creative-monetization", "vernacular-tutoring"],
        relevantMentorExpertise: ["Marketplace dynamics"],
        aiOpportunities: [
          { title: "Generative kente / Ankara pattern design with rights protection", why: "Designers' instincts curate good patterns; AI scales without theft." },
          { title: "Low-literacy UX kits for African apps", why: "Most apps assume Western reading order. Pictograms + voice-first patterns are valuable IP." },
          { title: "Brand-on-demand for African SMEs", why: "Hairdressers and tailors need logos. AI-generated + designer-curated wins this market." },
        ],
        localExamples: ["Kente weavers in Bonwire", "Tailor stalls in Yaba market", "Streetwear in Cape Town"],
        careerRoles: ["Industrial designer", "Brand founder", "UI/UX designer", "Creative-tech entrepreneur"],
        suggestedVentureSeed: "AI brand-on-demand subscription for African SMEs — logos, packaging, copy, weekly social.",
      },
      {
        id: "music",
        name: "Music & Performing Arts",
        programs: [
          { id: "bmus", name: "BA / BMus", level: "Undergraduate" },
          { id: "mmus", name: "MA Music", level: "Postgraduate" },
        ],
        relevantSectors: ["Creative"],
        relevantTracks: ["coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["brand-kit", "press-release", "lp-writer"],
        relevantProblemIds: ["creative-monetization"],
        relevantMentorExpertise: ["Marketplace dynamics"],
        aiOpportunities: [
          { title: "Rights-tracking for streaming royalty leakage", why: "Afrobeats artists lose 90% of royalties to opacity. Audio-fingerprint + on-chain registry fixes this." },
          { title: "AI mastering tuned for Afrobeats / Amapiano", why: "Generic LANDR settings ruin the genre. Local mastering is gold." },
          { title: "Generative beat-making for amateur producers", why: "Lowers barrier without lowering quality. Massive long-tail market." },
        ],
        localExamples: ["Lagos studio session", "Cape Town amapiano DJ", "Highlife royalties in Accra"],
        careerRoles: ["Producer", "Music-tech founder", "A&R", "Rights manager"],
        suggestedVentureSeed: "Audio-fingerprint + smart-royalty platform for Afrobeats artists.",
      },
    ],
  },
  {
    id: "comm",
    name: "School of Communications & Media",
    icon: "📡",
    color: "indigo",
    departments: [
      {
        id: "journalism",
        name: "Journalism & Media Studies",
        programs: [
          { id: "ba-journo", name: "BA Journalism", level: "Undergraduate" },
          { id: "ma-comm", name: "MA Communications", level: "Postgraduate" },
        ],
        relevantSectors: ["Governance", "Creative"],
        relevantTracks: ["coding-craft", "ai-for-your-field", "venture-building"],
        relevantAgents: ["press-release", "competitive-tear", "user-persona"],
        relevantProblemIds: ["governance-procurement", "vernacular-tutoring"],
        relevantMentorExpertise: ["Digital policy", "Public-sector"],
        aiOpportunities: [
          { title: "Investigative-journalism toolkits with document AI", why: "OCR + LLM on leaked PDFs surfaces corruption faster than any newsroom can read." },
          { title: "Multilingual news distillation for diaspora", why: "Local-language summaries of major reporting reach audiences English misses." },
          { title: "Misinformation detection for African elections", why: "Fact-check + ML + community is the only thing that works at WhatsApp scale." },
        ],
        localExamples: ["Premium Times procurement leaks", "Cape election misinformation cycle", "Daily Nation investigations"],
        careerRoles: ["Investigative journalist", "Media founder", "Newsroom data lead", "Content strategist"],
        suggestedVentureSeed: "Whatsapp-distributed misinfo-flagging bot for elections, in the major languages of your country.",
      },
    ],
  },
];

export function getDepartment(id: string): { department: Department; school: School } | null {
  for (const s of SCHOOLS) {
    const d = s.departments.find((x) => x.id === id);
    if (d) return { department: d, school: s };
  }
  return null;
}

export function getSchool(id: string) {
  return SCHOOLS.find((s) => s.id === id);
}

export function allDepartments(): Array<Department & { schoolName: string; schoolColor: string }> {
  return SCHOOLS.flatMap((s) => s.departments.map((d) => ({ ...d, schoolName: s.name, schoolColor: s.color })));
}
