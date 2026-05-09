/** Merge bearer token into HTTP headers. */
export function withBearerAuth(
  headers: Record<string, string> | undefined,
  token: string,
): Record<string, string> {
  return {
    ...(headers ?? {}),
    Authorization: `Bearer ${token}`,
  };
}
