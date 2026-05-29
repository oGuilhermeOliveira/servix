import { areaNameBySlug } from "./provider-areas.js";

/** Agrega avaliações por provider_id. */
export function aggregateReviewsByProvider(reviews) {
  const map = new Map();
  (reviews || []).forEach(function (row) {
    const pid = row.provider_id;
    if (!pid) return;
    if (!map.has(pid)) {
      map.set(pid, { sum: 0, count: 0, reviews: [] });
    }
    const entry = map.get(pid);
    const rating = Number(row.rating);
    if (!Number.isFinite(rating)) return;
    entry.sum += rating;
    entry.count += 1;
    entry.reviews.push(row);
  });
  return map;
}

export function averageRating(stats) {
  if (!stats || stats.count < 1) return null;
  return Math.round((stats.sum / stats.count) * 10) / 10;
}

export function formatRatingValue(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value).replace(".", ",");
}

/** Estrelas visuais (média 0–5). */
export function renderStarRating(rating, options) {
  const max = 5;
  const value = Math.max(0, Math.min(max, Number(rating) || 0));
  const showValue = options?.showValue !== false;
  const full = Math.floor(value);
  const half = value - full >= 0.35 && full < max;
  let stars = "";
  for (let i = 0; i < max; i++) {
    if (i < full) stars += "★";
    else if (i === full && half) stars += "★";
    else stars += "☆";
  }
  const span = document.createElement("span");
  span.className = "star-rating" + (options?.large ? " star-rating-lg" : "");
  span.setAttribute("aria-label", `Nota ${formatRatingValue(value)} de 5`);
  const starsEl = document.createElement("span");
  starsEl.className = "star-rating-stars";
  starsEl.textContent = stars;
  span.appendChild(starsEl);
  if (showValue) {
    const val = document.createElement("span");
    val.className = "star-rating-value";
    val.textContent = formatRatingValue(value);
    span.appendChild(val);
  }
  return span;
}

export async function fetchAllProviderReviews(db, limitCount) {
  if (!db) return [];
  const res = await db
    .from("provider_reviews")
    .select(
      "id, provider_id, request_id, client_name, rating, comment, area_slug, area_name, category, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limitCount || 300);
  if (res.error) {
    console.warn("provider_reviews:", res.error);
    return [];
  }
  return res.data || [];
}

export async function fetchProviderReviewStats(db) {
  const rows = await fetchAllProviderReviews(db, 500);
  return aggregateReviewsByProvider(rows);
}

/** Média e contagem de avaliações de um prestador. */
export async function fetchRatingStatsForProvider(db, providerId) {
  if (!db || !providerId) return null;
  const res = await db
    .from("provider_reviews")
    .select("rating, comment, client_name, created_at")
    .eq("provider_id", providerId);
  if (res.error || !res.data?.length) return null;
  const map = aggregateReviewsByProvider(
    res.data.map(function (r) {
      return { ...r, provider_id: providerId };
    })
  );
  return map.get(providerId) || null;
}

export async function fetchRecentTestimonials(db, limitCount) {
  const limit = limitCount || 12;
  const rows = await fetchAllProviderReviews(db, 80);
  const withComment = rows.filter(function (r) {
    return r.comment && String(r.comment).trim();
  });
  const pool = withComment.length ? withComment : rows;
  return pool.slice(0, limit);
}

export function resolveAreaLabel(review) {
  if (review.area_name) return review.area_name;
  if (review.area_slug) return areaNameBySlug(review.area_slug);
  return review.category || "Serviço";
}

export function globalAverageRating(reviews) {
  if (!reviews?.length) return null;
  let sum = 0;
  let count = 0;
  reviews.forEach(function (r) {
    const n = Number(r.rating);
    if (Number.isFinite(n)) {
      sum += n;
      count += 1;
    }
  });
  if (!count) return null;
  return Math.round((sum / count) * 10) / 10;
}
