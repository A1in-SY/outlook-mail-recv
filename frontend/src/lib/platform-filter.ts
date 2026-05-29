export interface SearchablePlatform {
  name: string;
}

export function filterPlatforms<T extends SearchablePlatform>(platforms: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return platforms;
  }

  return platforms.filter((platform) => platform.name.toLowerCase().includes(normalizedQuery));
}
