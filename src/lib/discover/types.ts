/** The columns one Discover row needs — a narrow slice of the catalog. */
export interface DiscoverGame {
  game_id: number;
  name: string;
  year_published: number | null;
  geek_rating: number | null;
  average_weight: number | null;
  best_player_counts: number[] | null;
  recommended_player_counts: number[] | null;
  categories: string[] | null;
}
