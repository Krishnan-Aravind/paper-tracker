import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const hasRealConfig =
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

const client = hasRealConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function isSupabaseConfigured() {
  return Boolean(client);
}

export function toIsoDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function yearDateRange(year) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  };
}

export async function fetchUserEntries(name, year) {
  if (!client) {
    return [];
  }

  const { start, end } = yearDateRange(year);
  const { data, error } = await client
    .from("entries")
    .select("date,count")
    .eq("name", name)
    .gte("date", start)
    .lte("date", end);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function incrementToday(name) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const today = toIsoDate(new Date());

  const { data: existing, error: readError } = await client
    .from("entries")
    .select("id,count")
    .eq("name", name)
    .eq("date", today)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!existing) {
    const { error: insertError } = await client
      .from("entries")
      .insert({ name, date: today, count: 1 });
    if (insertError) {
      throw insertError;
    }
    return 1;
  }

  const nextCount = existing.count + 1;
  const { error: updateError } = await client
    .from("entries")
    .update({ count: nextCount })
    .eq("id", existing.id);

  if (updateError) {
    throw updateError;
  }

  return nextCount;
}

export async function decrementToday(name) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const today = toIsoDate(new Date());
  const { data: existing, error: readError } = await client
    .from("entries")
    .select("id,count")
    .eq("name", name)
    .eq("date", today)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!existing) {
    return 0;
  }

  const nextCount = Math.max(0, existing.count - 1);
  const { error: updateError } = await client
    .from("entries")
    .update({ count: nextCount })
    .eq("id", existing.id);

  if (updateError) {
    throw updateError;
  }

  return nextCount;
}
