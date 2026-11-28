// Pure part of the on-device embeddings demo: the cosine score of two unit vectors.
// The model writes normalised vectors, so a plain dot product is their cosine similarity.
export const similarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Number(a[i]) * Number(b[i]);
  return Number.isFinite(sum) ? Math.max(-1, Math.min(1, sum)) : 0;
};
