/** Reduce dynamic enum expansion on the wire; exact IDs/lines remain validated after decoding. */
export function compactReviewSchema(schema: object): object {
  function visit(value: unknown, field = ""): unknown {
    if (Array.isArray(value)) return value.map(v => visit(v, field));
    if (value === null || typeof value !== "object") return value;
    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input)) {
      result[key] = key === "properties" && child !== null && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(Object.entries(child).map(([name, item]) => [name, visit(item, name)])) : visit(child, field);
    }
    if (field === "evidenceLines" && input.type === "integer" && Array.isArray(input.enum) && input.enum.length > 1 && input.enum.every(n => typeof n === "number" && Number.isSafeInteger(n))) {
      delete result.enum; result.minimum = Math.min(...input.enum as number[]); result.maximum = Math.max(...input.enum as number[]);
    }
    if (["sourceId", "issueId", "relatedRequirementId", "authorizationScopeIds"].includes(field) && input.type === "string") delete result.enum;
    return result;
  }
  return visit(schema) as object;
}
