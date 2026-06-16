import type { EvidenceRef } from "@ingredient-scanner/shared";

/** Build encyclopedia-backed evidence refs for a matched canonical ingredient. */
export function encyclopediaEvidenceRefs(args: {
  canonicalId: string;
  displayName: string;
  description?: string;
  dataSource?: string | null;
}): EvidenceRef[] {
  const refs: EvidenceRef[] = [
    {
      id: `encyclopedia:${args.canonicalId}`,
      sourceType: "encyclopedia",
      title: args.displayName,
      excerpt: args.description,
      confidence: 0.85,
    },
  ];
  if (args.dataSource) {
    refs.push({
      id: `encyclopedia:source:${args.canonicalId}`,
      sourceType: "manual",
      title: "Data source",
      excerpt: args.dataSource,
      confidence: 0.9,
    });
  }
  return refs;
}

export function countEvidenceRefs(
  ingredients: { evidenceRefs?: EvidenceRef[] }[],
): number {
  return ingredients.reduce((sum, ing) => sum + (ing.evidenceRefs?.length ?? 0), 0);
}
