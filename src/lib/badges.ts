export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};

export const BADGES: BadgeDef[] = [
  { id: "first-lesson", name: "First Step", description: "Completed your first lesson.", emoji: "🌱", rarity: "common" },
  { id: "streak-7", name: "Week Warrior", description: "Maintained a 7-day learning streak.", emoji: "🔥", rarity: "common" },
  { id: "streak-30", name: "Month of Mastery", description: "30-day streak. The habit is yours.", emoji: "💎", rarity: "rare" },
  { id: "level-5", name: "Initiate", description: "Reached level 5.", emoji: "⭐", rarity: "common" },
  { id: "level-10", name: "Scholar", description: "Reached level 10.", emoji: "🎓", rarity: "rare" },
  { id: "level-20", name: "Polymath", description: "Reached level 20.", emoji: "🧠", rarity: "epic" },
  { id: "first-venture", name: "Builder", description: "Launched your first venture.", emoji: "🚀", rarity: "common" },
  { id: "first-interview", name: "Listener", description: "Logged your first customer interview.", emoji: "👂", rarity: "common" },
  { id: "10-interviews", name: "Discovery Pro", description: "Logged 10 customer interviews.", emoji: "🔍", rarity: "rare" },
  { id: "first-revenue", name: "First Dollar", description: "First paying customer recorded.", emoji: "💰", rarity: "rare" },
  { id: "first-mvp-shipped", name: "Ship It", description: "Marked an MVP task as shipped.", emoji: "📦", rarity: "common" },
  { id: "pitch-deck", name: "Pitch Ready", description: "Generated your first pitch deck.", emoji: "🎤", rarity: "rare" },
  { id: "first-mentor-session", name: "Coached", description: "Booked your first mentor session.", emoji: "🤝", rarity: "common" },
  { id: "grant-applied", name: "Hunter", description: "Applied to your first funding source.", emoji: "🎯", rarity: "rare" },
  { id: "circuit-master", name: "Circuit Master", description: "Built a working circuit in the lab.", emoji: "⚡", rarity: "rare" },
  { id: "code-100", name: "Codesmith", description: "Ran 100 Python snippets.", emoji: "💻", rarity: "rare" },
  { id: "math-100", name: "Calculator", description: "Solved 100 math problems.", emoji: "🧮", rarity: "rare" },
  { id: "100k-mrr", name: "Six Figures", description: "Crossed $100k MRR.", emoji: "👑", rarity: "legendary" },
  { id: "acquired", name: "Exit", description: "Marked a venture as acquired.", emoji: "🏆", rarity: "legendary" },
  { id: "polyglot", name: "Polyglot", description: "Studied lessons in 3+ languages.", emoji: "🌍", rarity: "epic" },
];

export function getBadge(id: string) {
  return BADGES.find((b) => b.id === id);
}
