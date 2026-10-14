/**
 * Server-safe JSON-LD for Google rich results.
 * Always emits a single object root — Safari throws on bare arrays
 * (`TypeError: r["@context"].toLowerCase`).
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(toJsonLdDocument(data)) }}
    />
  );
}

function toJsonLdDocument(
  data: Record<string, unknown> | Record<string, unknown>[]
): Record<string, unknown> {
  if (!Array.isArray(data)) return data;
  if (data.length === 1) return data[0]!;
  const graph = data.map((node) => {
    const { ["@context"]: _context, ...rest } = node;
    return rest;
  });
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
