export const IMAGE_BUCKET = "poke-stamp-images";
export const MAX_IMAGE_SIZE_BYTES = 300 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const LOGS_PAGE_SIZE = 20;
export const MIN_SEARCH_LENGTH = 3;

export const getActiveSearchTerm = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= MIN_SEARCH_LENGTH ? normalized : "";
};
