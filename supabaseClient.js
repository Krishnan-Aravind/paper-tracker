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
  const today = toIsoDate(new Date());
  return incrementDate(name, today);
}

export async function decrementToday(name) {
  const today = toIsoDate(new Date());
  return decrementDate(name, today);
}

export async function incrementDate(name, isoDate) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { data: existing, error: readError } = await client
    .from("entries")
    .select("id,count")
    .eq("name", name)
    .eq("date", isoDate)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (!existing) {
    const { error: insertError } = await client
      .from("entries")
      .insert({ name, date: isoDate, count: 1 });
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

export async function decrementDate(name, isoDate) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { data: existing, error: readError } = await client
    .from("entries")
    .select("id,count")
    .eq("name", name)
    .eq("date", isoDate)
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

export async function fetchMonthlyHistory(monthKey) {
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("monthly_history")
    .select("month_key,name,papers_read,points,captured_at")
    .eq("month_key", monthKey)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function replaceMonthlyHistory(monthKey, rows) {
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { error: deleteError } = await client
    .from("monthly_history")
    .delete()
    .eq("month_key", monthKey);
  if (deleteError) {
    throw deleteError;
  }

  if (!rows.length) {
    return;
  }

  const payload = rows.map((row) => ({
    month_key: monthKey,
    name: row.name,
    papers_read: row.papers_read,
    points: row.points
  }));
  const { error: insertError } = await client
    .from("monthly_history")
    .insert(payload);
  if (insertError) {
    throw insertError;
  }
}
