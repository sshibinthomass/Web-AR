export type ModelOption = {
  id: string;
  label: string;
  url: string;
  previewUrl?: string;
  source?: 'uploaded';
  ownerEmail?: string;
  visibility?: ModelVisibility;
  bytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ModelVisibility = 'public' | 'private';

export const MODEL_OPTIONS: ModelOption[] = [];
