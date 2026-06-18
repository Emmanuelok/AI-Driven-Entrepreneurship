export type LegalDoc = {
  id: string;
  name: string;
  category: "Founders" | "Hiring" | "Customers" | "Investors" | "IP" | "Governance";
  description: string;
  jurisdictions: string[];
  vars: { key: string; label: string; placeholder?: string }[];
  template: string; // {{var}} substitution
  estReadingMinutes: number;
  // School ids (from src/lib/disciplines.ts) where this doc is
  // typically among the first founders need. Used by the docs UI's
  // "For [Department]" filter to surface relevant docs first. If a
  // discipline isn't listed here, the doc is still browsable — just
  // not highlighted.
  disciplines?: string[];
  // Universal docs are needed by ~every founder regardless of
  // discipline (NDA, founders agreement). Sorted to the top of the
  // "for your discipline" view alongside discipline matches.
  universal?: boolean;
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: "mutual-nda",
    name: "Mutual NDA (short form)",
    category: "Customers",
    description: "Two-page mutual non-disclosure agreement for early conversations with partners, vendors, or pilots.",
    jurisdictions: ["Nigeria", "Ghana", "Kenya", "South Africa", "Generic common-law"],
    estReadingMinutes: 6,
    universal: true,
    vars: [
      { key: "company", label: "Your company legal name", placeholder: "Sankofa Studio Ltd" },
      { key: "counterparty", label: "Counterparty name", placeholder: "Yendi Tomato Cooperative" },
      { key: "date", label: "Effective date" },
      { key: "purpose", label: "Purpose of disclosure (one sentence)", placeholder: "Evaluating a pilot of solar microcold storage." },
      { key: "term", label: "Term (months)", placeholder: "24" },
    ],
    template: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{date}} ("Effective Date") between {{company}} ("Party A") and {{counterparty}} ("Party B") (each a "Party" and collectively the "Parties").

1. PURPOSE. The Parties wish to explore: {{purpose}}. In connection with this Purpose, each Party may disclose to the other certain confidential information.

2. CONFIDENTIAL INFORMATION. "Confidential Information" means any information disclosed by one Party (the "Discloser") to the other (the "Recipient"), in any form, that is marked or reasonably understood to be confidential, including business plans, technical data, financial information, customer lists, and the existence and terms of this Agreement.

3. OBLIGATIONS. The Recipient shall (a) use Confidential Information only for the Purpose, (b) limit access to employees, advisors, and contractors with a need to know who are bound by confidentiality obligations no less stringent than these, and (c) protect Confidential Information using the same care it uses for its own confidential information, but in no event less than reasonable care.

4. EXCLUSIONS. Confidential Information does not include information that (a) is or becomes publicly known through no fault of the Recipient, (b) was rightfully known prior to disclosure, (c) is rightfully received from a third party without confidentiality obligations, or (d) is independently developed without use of Confidential Information.

5. COMPELLED DISCLOSURE. If the Recipient is compelled by law or court order to disclose Confidential Information, it shall give the Discloser prompt prior notice (where lawful) and reasonable assistance to seek a protective order.

6. TERM. This Agreement remains in effect for {{term}} months from the Effective Date. Obligations regarding trade secrets continue for so long as such information remains a trade secret.

7. NO LICENSE. No license under any intellectual property right is granted by this Agreement.

8. REMEDIES. The Parties agree that monetary damages may be inadequate and that equitable relief, including injunction, is appropriate in the event of breach.

9. GOVERNING LAW. This Agreement is governed by the laws of [JURISDICTION].

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

{{company}}                       {{counterparty}}
___________________               ___________________
Authorized Signature              Authorized Signature

— END OF AGREEMENT —

⚠️ This is a template. Have a qualified lawyer in your jurisdiction review before signing anything.`,
  },
  {
    id: "founders-agreement",
    name: "Founders Agreement",
    category: "Founders",
    description: "Equity split, vesting, IP assignment, decision-making — the conversation every team must have before things get complicated.",
    jurisdictions: ["Nigeria", "Ghana", "Kenya", "South Africa", "Delaware"],
    estReadingMinutes: 12,
    universal: true,
    vars: [
      { key: "company", label: "Company name", placeholder: "Your company name" },
      { key: "founder1", label: "Founder 1 name + email" },
      { key: "founder1_pct", label: "Founder 1 equity %", placeholder: "40" },
      { key: "founder1_role", label: "Founder 1 role", placeholder: "CEO" },
      { key: "founder2", label: "Founder 2 name + email" },
      { key: "founder2_pct", label: "Founder 2 equity %", placeholder: "35" },
      { key: "founder2_role", label: "Founder 2 role", placeholder: "CTO" },
      { key: "founder3", label: "Founder 3 name + email (or N/A)" },
      { key: "founder3_pct", label: "Founder 3 equity %", placeholder: "25" },
      { key: "founder3_role", label: "Founder 3 role", placeholder: "COO" },
      { key: "vesting_years", label: "Vesting (years)", placeholder: "4" },
      { key: "cliff_months", label: "Cliff (months)", placeholder: "12" },
    ],
    template: `FOUNDERS AGREEMENT — {{company}}

This Founders Agreement ("Agreement") sets out the founding terms between:

  • {{founder1}} — {{founder1_role}} — {{founder1_pct}}%
  • {{founder2}} — {{founder2_role}} — {{founder2_pct}}%
  • {{founder3}} — {{founder3_role}} — {{founder3_pct}}%

(each a "Founder" and collectively the "Founders").

1. PURPOSE. The Founders are jointly forming and operating {{company}} (the "Company") for the purpose of pursuing the business as described in the Company's then-current business plan.

2. EQUITY SPLIT. Founders agree the founding equity split shown above is final, subject only to (a) employee stock option pool to be set aside upon first equity financing (typically 10-15%), and (b) dilution from future financings on equal terms.

3. VESTING. All founder equity is subject to a {{vesting_years}}-year vesting schedule with a {{cliff_months}}-month cliff. Vesting accelerates by 100% upon a change of control where the acquirer terminates the Founder without cause, or by 50% on a change of control regardless ("double-trigger" / "single-trigger" — pick one; ⚠️ legal advice required).

4. IP ASSIGNMENT. Each Founder hereby assigns to the Company all intellectual property created prior to or during the formation period and related to the Company's business. Each Founder will sign the Company's standard Confidential Information and Invention Assignment Agreement.

5. ROLES AND COMMITMENTS. Each Founder commits to working full-time for the Company except as expressly disclosed in Schedule A. Material outside obligations require unanimous written consent of the other Founders.

6. DECISION MAKING. Day-to-day decisions are made by the CEO. The following decisions require unanimous Founder approval until the first equity financing: (a) changing the business model, (b) issuing equity to non-employees, (c) taking on debt > USD 50,000, (d) bringing on a new co-founder, (e) winding down the business.

7. SEPARATION. If a Founder leaves the Company:
   (a) For Cause or by voluntary resignation before the cliff: forfeits all unvested AND vested equity (or per the Company's then-current equity plan).
   (b) Without Cause: keeps all vested equity; unvested equity returns to the Company.
   (c) "Cause" means material breach, fraud, willful misconduct, conviction of a felony, or persistent failure to perform after 30 days' written notice.

8. NON-COMPETE & NON-SOLICIT. During tenure and for 12 months after separation, no Founder shall directly compete with the Company in its primary market, nor solicit Company employees, customers, or investors.

9. DISPUTE RESOLUTION. Disputes shall first go to mediation. If unresolved within 60 days, disputes shall be arbitrated under the rules of [arbitral body], with the seat in [city]. Each Founder waives jury trial.

10. AMENDMENTS. This Agreement may only be amended in writing signed by all Founders.

SIGNED:

{{founder1}}                      {{founder2}}                      {{founder3}}
________________                  ________________                  ________________
Date:                             Date:                             Date:

⚠️ STRONGLY recommend a lawyer reviews this before signing. Founders agreements that look bulletproof at signing reveal problems years later. The conversation is more important than the document.`,
  },
  {
    id: "safe-note",
    name: "SAFE (Simple Agreement for Future Equity)",
    category: "Investors",
    description: "Standard YC-style SAFE — post-money, valuation cap, no discount or MFN variants.",
    jurisdictions: ["Delaware", "Generic (consult counsel)"],
    estReadingMinutes: 8,
    disciplines: ["engineering", "business", "sciences", "comm", "creative"],
    vars: [
      { key: "company", label: "Company name" },
      { key: "investor", label: "Investor legal name" },
      { key: "amount", label: "Investment amount (USD)", placeholder: "100000" },
      { key: "cap", label: "Post-money valuation cap (USD)", placeholder: "8000000" },
      { key: "date", label: "Effective date" },
    ],
    template: `POST-MONEY SAFE (Simple Agreement for Future Equity)

Company: {{company}}
Investor: {{investor}}
Purchase Amount: USD {{amount}}
Post-Money Valuation Cap: USD {{cap}}
Date: {{date}}

THIS CERTIFIES THAT in exchange for the payment by Investor of USD {{amount}} (the "Purchase Amount") on or about the date above, {{company}} ("Company"), issues to {{investor}} ("Investor") the right to certain shares of Company's Capital Stock, subject to the terms below.

EVENTS

1. EQUITY FINANCING. If there is an Equity Financing before the termination of this SAFE, on the initial closing of such financing, this SAFE will automatically convert into the greater of (a) the number of shares of the Standard Preferred Stock equal to the Purchase Amount divided by the lowest price per share of the Standard Preferred Stock, or (b) the number of shares of Safe Preferred Stock equal to the Purchase Amount divided by the Safe Price.

2. LIQUIDITY EVENT. If there is a Liquidity Event before the termination of this SAFE, this SAFE will automatically be entitled to receive a portion of Proceeds equal to the greater of (i) the Purchase Amount or (ii) the amount payable on the number of shares of Common Stock equal to the Purchase Amount divided by the Liquidity Price.

3. DISSOLUTION EVENT. If a Dissolution Event occurs before this SAFE terminates, the Company will pay the Investor an amount equal to the Purchase Amount.

DEFINITIONS

"Safe Price" means the price per share equal to the Post-Money Valuation Cap divided by the Company Capitalization.

"Company Capitalization" is calculated as of immediately prior to the Equity Financing and includes all shares of Capital Stock issued and outstanding, all converted SAFEs and Convertible Securities, the Unissued Option Pool, but excludes the Discount.

INVESTOR RIGHTS

The Investor has Pro Rata Rights as defined in the standard YC post-money SAFE.

GOVERNING LAW

This SAFE shall be governed by the laws of the State of Delaware.

SIGNED:

{{company}}                          {{investor}}
By: ___________________              By: ___________________
Title: ___________________           Date: ___________________

⚠️ Use the official YC SAFE template at ycombinator.com/documents in real transactions. This is a structural reference only. Counsel review required, especially for non-Delaware closings.`,
  },
  {
    id: "employment-offer",
    name: "Employment Offer Letter",
    category: "Hiring",
    description: "Friendly, founder-style offer letter with options, base, role, and clear expectations.",
    jurisdictions: ["Generic — adapt to local labor law"],
    estReadingMinutes: 5,
    disciplines: ["business", "engineering", "comm"],
    vars: [
      { key: "company", label: "Company name" },
      { key: "candidate", label: "Candidate full name" },
      { key: "role", label: "Role title" },
      { key: "start_date", label: "Start date" },
      { key: "base", label: "Base salary (annual, local currency)" },
      { key: "options", label: "Stock options (shares)", placeholder: "150,000" },
      { key: "vesting", label: "Vesting (4y, 1y cliff is standard)" },
    ],
    template: `Dear {{candidate}},

We're delighted to offer you the role of {{role}} at {{company}}, starting {{start_date}}.

The terms:

  • Base salary: {{base}}, paid monthly
  • Equity: {{options}} shares of Common Stock, subject to {{vesting}}
  • Benefits: Health coverage, learning stipend, equipment, paid leave per local law
  • Reporting to: CEO
  • Location: Remote, with travel as needed

Why this role exists at {{company}}: [describe the actual problem they will own — write this in 2-3 sentences before sending]

Your first 90 days:
  1. [specific milestone 1]
  2. [specific milestone 2]
  3. [specific milestone 3]

This offer is contingent on (a) completion of background checks, (b) your right to work in the relevant jurisdiction, (c) signing our standard Confidential Information and Invention Assignment Agreement.

Employment with {{company}} is "at-will" subject to local labor law. Either party may terminate the relationship per the notice requirements in our employee handbook.

This offer expires in 7 days unless you tell us otherwise.

Please respond with your acceptance. We can't wait to build with you.

Warmly,

[Founder name]
{{company}}

⚠️ Adapt termination, notice, severance, and statutory benefit sections to local labor law (Nigeria, Ghana, Kenya, SA all have distinct requirements). Legal review recommended.`,
  },
  {
    id: "iiia",
    name: "Invention Assignment & Confidentiality Agreement (IIIA)",
    category: "IP",
    description: "Standard agreement every employee, contractor, and advisor signs to assign inventions to the company.",
    jurisdictions: ["Generic common-law"],
    estReadingMinutes: 7,
    disciplines: ["engineering", "sciences", "health", "creative"],
    vars: [
      { key: "company", label: "Company name" },
      { key: "individual", label: "Individual full name" },
      { key: "role", label: "Role (employee, contractor, advisor)" },
    ],
    template: `CONFIDENTIAL INFORMATION AND INVENTION ASSIGNMENT AGREEMENT

This Agreement is between {{company}} ("Company") and {{individual}} ("Individual"), serving as a {{role}}.

1. CONFIDENTIAL INFORMATION. Individual will not, during or after the engagement, disclose any Confidential Information of the Company to any third party, or use it except for the benefit of the Company.

2. INVENTION ASSIGNMENT. Individual agrees that all Inventions made or conceived during the engagement, that (a) relate to the Company's business, (b) result from work performed for the Company, or (c) use Company equipment, facilities, or Confidential Information, are the sole property of the Company. Individual hereby assigns all rights, title, and interest in such Inventions to the Company.

3. PRIOR INVENTIONS. Individual lists in Exhibit A any prior inventions belonging to Individual that should be excluded from this assignment. If Exhibit A is blank, Individual represents that there are no such inventions.

4. THIRD-PARTY IP. Individual will not use or incorporate any third-party intellectual property without disclosing it and obtaining Company written consent.

5. RETURN OF MATERIALS. Upon termination of the engagement, Individual will return all Company materials, including any Confidential Information in any form.

6. NON-SOLICIT. During the engagement and for 12 months after, Individual will not solicit Company employees, customers, or contractors.

7. GENERAL. This Agreement is governed by the laws of [jurisdiction]. It survives termination of the engagement.

EXHIBIT A — PRIOR INVENTIONS

[List any pre-existing inventions to be excluded. If none, write "None."]

SIGNED:

{{individual}}                      {{company}}
________________                    ________________
Date:                               By:
                                    Title:

⚠️ Required reading: jurisdiction-specific carve-outs for inventions developed on personal time and unrelated to company business (e.g. California Labor Code §2870). Legal review.`,
  },
  {
    id: "advisor-agreement",
    name: "Advisor Agreement",
    category: "Governance",
    description: "Bring on an advisor with clear scope, equity, and confidentiality terms.",
    jurisdictions: ["Generic"],
    estReadingMinutes: 5,
    universal: true,
    vars: [
      { key: "company", label: "Company name" },
      { key: "advisor", label: "Advisor name" },
      { key: "scope", label: "Advisor scope (one sentence)" },
      { key: "equity", label: "Advisor equity (% or shares)", placeholder: "0.25%" },
      { key: "term", label: "Term (months)", placeholder: "24" },
    ],
    template: `ADVISOR AGREEMENT

This Agreement is between {{company}} ("Company") and {{advisor}} ("Advisor"), effective [date].

1. SCOPE. Advisor will provide informal advisory services to Company in the following area: {{scope}}. Time commitment: approximately 2 hours/month, including 1 scheduled call and ad-hoc availability.

2. COMPENSATION. In consideration of Advisor's services, Company grants Advisor {{equity}} of Company equity, vesting monthly over {{term}} months, subject to acceleration on a Change of Control.

3. CONFIDENTIALITY. Advisor agrees to maintain in strict confidence all non-public information regarding the Company.

4. NON-EXCLUSIVITY. Advisor may serve as advisor to other companies, except direct competitors of the Company.

5. INTELLECTUAL PROPERTY. Any inventions, materials, or work product Advisor creates specifically for Company shall belong to Company.

6. TERMINATION. Either party may terminate this Agreement with 30 days' notice. Vested equity remains; unvested equity returns to the Company option pool.

7. NO EMPLOYMENT. Advisor is an independent contractor, not an employee, of the Company.

SIGNED:

{{company}}                              {{advisor}}
________________                         ________________
Date:                                    Date:

⚠️ Founder Institute's FAST agreement is a great public-domain alternative. Adapt to your equity grant mechanism.`,
  },
  {
    id: "convertible-loan",
    name: "Convertible Loan Note",
    category: "Investors",
    description: "Debt that converts to equity at next priced round. Common alternative to SAFE in non-US jurisdictions.",
    jurisdictions: ["UK", "Nigeria", "Kenya", "Generic"],
    estReadingMinutes: 9,
    disciplines: ["engineering", "business", "sciences"],
    vars: [
      { key: "company", label: "Company name" },
      { key: "investor", label: "Investor / lender" },
      { key: "amount", label: "Principal amount (USD)" },
      { key: "rate", label: "Interest rate (%)", placeholder: "6" },
      { key: "cap", label: "Conversion valuation cap (USD)" },
      { key: "discount", label: "Conversion discount (%)", placeholder: "20" },
      { key: "maturity", label: "Maturity (months)", placeholder: "24" },
    ],
    template: `CONVERTIBLE LOAN NOTE

Principal: USD {{amount}}
Lender: {{investor}}
Borrower: {{company}}
Interest Rate: {{rate}}% per annum, simple
Valuation Cap (at conversion): USD {{cap}}
Conversion Discount: {{discount}}%
Maturity: {{maturity}} months from the Effective Date

1. LOAN. Lender agrees to lend Borrower the Principal Amount, evidenced by this Note.

2. INTEREST. Interest accrues at the Interest Rate but is not paid in cash — it accrues to the Principal at Maturity or at Conversion.

3. CONVERSION ON QUALIFIED FINANCING. Upon a Qualified Financing (defined as a sale of preferred shares raising at least USD 1,000,000 in aggregate), the entire outstanding Principal plus accrued Interest converts into the same class of preferred shares at the lower of: (a) the per-share price of the Qualified Financing minus the Conversion Discount, or (b) a price implied by the Valuation Cap.

4. CONVERSION ON LIQUIDITY EVENT. If a Liquidity Event occurs prior to a Qualified Financing or Maturity, Lender shall receive, at Lender's election, either (a) the Principal plus accrued Interest in cash, or (b) shares of Common Stock at the Valuation Cap price.

5. MATURITY. If neither a Qualified Financing nor a Liquidity Event occurs by Maturity, Lender may elect to (a) demand repayment of Principal plus accrued Interest, or (b) convert at the Valuation Cap.

6. EVENTS OF DEFAULT. Default occurs if Borrower (a) fails to repay at Maturity when due, (b) becomes insolvent, or (c) materially breaches this Note.

7. GOVERNING LAW. The laws of [jurisdiction] govern this Note.

SIGNED:

{{company}}                            {{investor}}
By: ________________                   By: ________________
Title:                                 Date:
Date:

⚠️ Convertibles are taxed and regulated very differently by jurisdiction. Get a tax-and-corporate lawyer for any closing >USD 50k.`,
  },
];

export function getLegalDoc(id: string) {
  return LEGAL_DOCS.find((d) => d.id === id);
}

export function renderDoc(doc: LegalDoc, vars: Record<string, string>): string {
  return doc.template.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k]?.trim() || `[${k}]`);
}
