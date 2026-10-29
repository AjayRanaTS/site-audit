import type { User } from "@supabase/supabase-js";

export function getUserDisplayName(user: User) {
  const metadata = user.user_metadata;
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const registeredName = [firstName, lastName].filter(Boolean).join(" ");
  if (registeredName) return registeredName;
  if (typeof metadata.full_name === "string" && metadata.full_name.trim()) return metadata.full_name.trim();
  if (typeof metadata.name === "string" && metadata.name.trim()) return metadata.name.trim();
  return user.email ?? "Your account";
}

export function getUserInitials(user: User) {
  const displayName = getUserDisplayName(user);
  const nameParts = displayName === user.email ? [] : displayName.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length > 1) return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
  if (nameParts.length === 1) return nameParts[0].slice(0, 2).toUpperCase();
  return user.email?.trim().slice(0, 1).toUpperCase() || "U";
}
