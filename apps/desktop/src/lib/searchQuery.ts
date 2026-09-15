/**
 * The fewest characters a search needs. The backend uses the same number (MIN_QUERY_CHARS in
 * src-tauri/src/db/search_query.rs) and finds nothing for a shorter search.
 */
export const MIN_SEARCH_CHARACTERS = 2;

/** True when a typed search is long enough to run. Spaces at the start and the end do not count. */
export function isSearchable(query: string): boolean {
  // Array.from counts characters like Rust's chars().count(), also outside the Basic Multilingual Plane.
  return Array.from(query.trim()).length >= MIN_SEARCH_CHARACTERS;
}
