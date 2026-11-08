"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "cn"

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

/** Inline theme picker for Settings. The header icon-dropdown (ThemeToggle) stays for quick access;
 * this surfaces the same preference somewhere people expect to find it. */
export function AppearanceForm() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex max-w-xl flex-wrap gap-2" role="radiogroup" aria-label="Theme">
      {options.map((option) => {
        const Icon = option.icon
        const active = theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            suppressHydrationWarning
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition",
              active
                ? "border-brand/40 bg-brand-soft text-brand"
                : "border-border hover:border-brand/30 hover:bg-muted",
            )}
          >
            <Icon className="size-4" /> {option.label}
          </button>
        )
      })}
    </div>
  )
}
