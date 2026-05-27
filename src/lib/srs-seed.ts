// Seed flashcard decks loaded into the SRS on first launch.

export const SEED_DECKS = [
  {
    name: "Python Fundamentals",
    description: "Variables, lists, loops, functions — the bedrock.",
    cards: [
      { front: "What does this print?\n\n`x = 5; print(x + 3)`", back: "8 — print evaluates `x + 3` to 8." },
      { front: "How do you loop over a list `items`?", back: "`for item in items:`\n    do something with item" },
      { front: "What is a dictionary in Python?", back: "An unordered collection of key-value pairs. `{'name': 'Ama', 'age': 22}`" },
      { front: "What does `len([1, 2, 3])` return?", back: "3 — the number of items in the list." },
      { front: "What's the difference between `=` and `==`?", back: "`=` assigns a value. `==` compares two values for equality." },
      { front: "How do you read a file in Python?", back: "`with open('file.txt') as f:\n    contents = f.read()`" },
      { front: "What does `def hello():` mean?", back: "Defines a function called `hello` taking no arguments." },
      { front: "What is a list comprehension?", back: "A compact way to build a list: `[x * 2 for x in range(5)]` → [0, 2, 4, 6, 8]" },
    ],
  },
  {
    name: "Customer Discovery Mantras",
    description: "Rules every founder must memorize before doing interviews.",
    cards: [
      { front: "Why never lead with your solution in a customer interview?", back: "People will be polite and validate anything that sounds clever. You'll get false positives and build the wrong thing." },
      { front: "What's the 'mom test' rule?", back: "Don't ask hypotheticals. Ask about specific, recent past behavior. 'Walk me through last Tuesday' beats 'Would you use this?'" },
      { front: "What's the minimum number of interviews before you start to see patterns?", back: "Around 20. After that, marginal information per interview drops sharply." },
      { front: "What's the difference between a verbal 'maybe' and a real validation?", back: "A signed LOI, a deposit, or a documented behavior change. Words are cheap." },
      { front: "Who should you NOT interview first?", back: "Your friends and family. They will lie kindly. Strangers in your target segment tell the truth." },
      { front: "How long should a discovery interview last?", back: "20-30 minutes max. Longer = you're pitching, not listening." },
    ],
  },
  {
    name: "Olympiad Problem-Solving Heuristics",
    description: "Polya, Engel, Zeitz — distilled into recall-able cards.",
    cards: [
      { front: "What is the Pigeonhole Principle?", back: "If n+1 objects are placed in n boxes, at least one box contains ≥2 objects." },
      { front: "Three classic invariants to look for in combinatorial games?", back: "Parity, modular arithmetic, sum-of-positions." },
      { front: "What is the Pythagorean identity?", back: "sin²θ + cos²θ = 1" },
      { front: "What is the sum of the first n positive integers?", back: "n(n+1)/2" },
      { front: "What is the sum of the first n perfect squares?", back: "n(n+1)(2n+1)/6" },
      { front: "What is the formula for the discriminant of ax² + bx + c?", back: "Δ = b² − 4ac" },
      { front: "What is the binomial coefficient C(n, k)?", back: "n! / (k! · (n−k)!) — the number of ways to choose k items from n." },
      { front: "State the Triangle Inequality.", back: "For any triangle, the sum of any two sides exceeds the third. |a−b| < c < a+b." },
      { front: "What is the AM-GM inequality (2-variable)?", back: "For non-negative a, b: (a+b)/2 ≥ √(ab), with equality iff a = b." },
    ],
  },
  {
    name: "African Markets — Operating Knowledge",
    description: "Facts and frameworks every African founder should know cold.",
    cards: [
      { front: "What is M-Pesa and why does it matter?", back: "Kenyan mobile-money rail launched 2007. Now processes >50% of Kenya's GDP. The backbone of any consumer fintech in East Africa." },
      { front: "What's the AfCFTA?", back: "African Continental Free Trade Area — the legal framework reducing tariffs across 54 African countries. Active since 2021." },
      { front: "Roughly what % of African SMEs are 'unbanked'?", back: "~70-80%. They're cash-based and invisible to traditional credit systems." },
      { front: "What is Open Banking in Nigeria?", back: "CBN-mandated API standards enabling third-party access to bank data with customer consent. Live since 2024." },
      { front: "What's WhatsApp's penetration in urban Nigeria?", back: ">90% of smartphone users. Why every B2C strategy includes WhatsApp." },
      { front: "What's the largest African VC fund by AUM?", back: "TLcom Capital, Partech Africa, Norrsken22, and Novastar all manage $200M+ funds. Quickly shifting league." },
      { front: "What is a 'tro-tro'?", back: "Ghana's shared minibus taxi — and a useful proxy for transport-economics intuition for any new African market." },
    ],
  },
];
