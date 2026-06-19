// Tiny JSON-LD emitter. Use it from server components / layouts to
// dump a typed schema.org payload into a <script type="application/
// ld+json"> tag. Search engines (Google, Bing, Brave) pick this up
// for rich-result eligibility — Person cards, Course cards, ItemList
// for ventures, etc.
//
// Keep the shape unknown — we don't want to lock the caller into a
// narrow generated type when schema.org keeps expanding.

export function StructuredData({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      // Stringify here so the JSX doesn't escape the angle brackets
      // search engines need. dangerouslySetInnerHTML is the standard
      // pattern for ld+json.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(
          Array.isArray(data) ? data : { "@context": "https://schema.org", ...data },
        ),
      }}
    />
  );
}
