/**
 * Canonical product identity. Import this instead of hard-coding the name.
 * Support contact and the public site URL are runtime settings in getSiteConfig().
 */
export const brand = {
  name: "Cognera AI",
  shortName: "Cognera",
  tagline: "Automate work. Manage content. Grow smarter.",
  description: "AI automation for leads, content and operations — powered by a private model on your own hardware.",
} as const

export type Brand = typeof brand
