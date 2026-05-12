export interface Flashcard {
  id: string;
  project: string;
  front: string;
  back: string;
  tags: string[];
  created_at: string;
  next_review: string;
  scheduled_days: number;
  stability: number;
  difficulty: number;
  fsrs_state: "New" | "Learning" | "Review" | "Relearning";
  review_count: number;
  lapse_count: number;
  learning_steps: number;
  last_review?: string;
}

export interface Project {
  name: string;
  description: string;
  memory: string;
  created_at: string;
}

export interface Store {
  projects: Project[];
  flashcards: Flashcard[];
}

export interface StoreBackend {
  load(): Promise<Store>;
  save(store: Store): Promise<void>;
}
