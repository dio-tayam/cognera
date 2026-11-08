"use client"

import { useEffect, useState } from "react"

export function RotatingWord({ words, interval = 2400 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIndex((value) => (value + 1) % words.length), interval)
    return () => window.clearInterval(id)
  }, [interval, words.length])
  const word = words[index] ?? ""
  return (
    <span className="relative inline-block">
      <span className="sr-only">{words.join(", ")}</span>
      <span key={word} aria-hidden="true" className="animate-word inline-block font-semibold text-brand">
        {word}
      </span>
    </span>
  )
}
