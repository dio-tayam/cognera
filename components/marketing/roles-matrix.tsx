"use client"

import { useState } from "react"
import { Check, Crown, Minus, PenLine, Shield, User } from "lucide-react"
import { can, permissionGroups, roleDescriptions, roles, type Role } from "@/lib/auth/permissions"
import { cn } from "cn"

const icons: Record<Role, typeof Crown> = { owner: Crown, admin: Shield, editor: PenLine, member: User }

export function RolesMatrix({ currentRole = null }: { currentRole?: Role | null }) {
  const [focus, setFocus] = useState<Role>(currentRole ?? "editor")
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label="Role">
        {roles.map((role) => {
          const Icon = icons[role]
          const selected = role === focus
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setFocus(role)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition",
                selected ? "border-transparent bg-foreground text-background shadow-[var(--elevation-2)]" : "bg-card hover:-translate-y-0.5",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn("grid size-8 place-items-center rounded-lg", selected ? "bg-signal text-signal-foreground" : "bg-brand-soft text-brand")}>
                  <Icon className="size-4" />
                </span>
                {currentRole === role ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", selected ? "bg-background/15" : "bg-muted")}>
                    You
                  </span>
                ) : null}
              </span>
              <span className="font-semibold capitalize">{role}</span>
              <span className={cn("text-xs leading-5", selected ? "text-background/70" : "text-muted-foreground")}>
                {roleDescriptions[role]}
              </span>
            </button>
          )
        })}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-mono text-[10px] font-normal tracking-[0.15em] text-muted-foreground uppercase">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className={cn("px-3 py-3 text-center font-medium capitalize transition", role === focus ? "bg-brand-soft text-brand" : "text-muted-foreground")}
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionGroups.map((group) => (
              <GroupRows key={group.group} group={group} focus={focus} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupRows({ group, focus }: { group: (typeof permissionGroups)[number]; focus: Role }) {
  return (
    <>
      <tr className="bg-muted/50">
        <td colSpan={5} className="px-4 py-2 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {group.group}
        </td>
      </tr>
      {group.items.map((item) => (
        <tr key={item.id} className="border-t">
          <td className="px-4 py-2.5">{item.label}</td>
          {roles.map((role) => {
            const allowed = can(role, item.id)
            return (
              <td key={role} className={cn("px-3 py-2.5 text-center transition", role === focus && "bg-brand-soft/60")}>
                {allowed ? (
                  <span className="inline-grid size-5 place-items-center rounded-full bg-success/15 text-success">
                    <Check className="size-3" aria-label="Allowed" />
                  </span>
                ) : (
                  <Minus className="mx-auto size-3.5 text-muted-foreground/50" aria-label="Not allowed" />
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
