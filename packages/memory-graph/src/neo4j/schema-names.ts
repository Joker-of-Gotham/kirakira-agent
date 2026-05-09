export function constraintName(label: string, property: string): string {
  return `cst_${label}_${property}_unique`.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function btreeIndexName(label: string, property: string): string {
  return `idx_${label}_${property}_range`.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function fulltextIndexName(label: string, property: string): string {
  return `ft_${label}_${property}`.replace(/[^a-zA-Z0-9_]/g, "_");
}
