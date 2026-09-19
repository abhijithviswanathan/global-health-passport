/**
 * Shared CSS class composition helper for web components. Combines conditional
 * class names and resolves conflicting Tailwind utilities; no clinical logic.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
