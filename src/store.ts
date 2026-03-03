export interface Flashcard {
  id: string;
  project: string;
  front: string;
  back: string;
  tags: string[];
  created_at: string;
  next_review: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
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
