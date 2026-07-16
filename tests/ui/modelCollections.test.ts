import { describe, expect, it } from 'vitest';
import { modelCollectionsEqual } from '../../src/ui/modelCollections';

const model = {
  id: 'chair',
  label: 'Chair',
  url: 'https://assets.example/chair.glb',
  previewUrl: 'https://assets.example/chair.png',
  visibility: 'private' as const,
};

describe('modelCollectionsEqual', () => {
  it('treats a cloned unchanged collection as equal', () => {
    expect(modelCollectionsEqual([model], [{ ...model }])).toBe(true);
  });

  it('detects label, thumbnail, visibility, order, and membership changes', () => {
    const table = {
      id: 'table',
      label: 'Table',
      url: 'https://assets.example/table.glb',
      visibility: 'public' as const,
    };

    expect(modelCollectionsEqual([model], [{ ...model, label: 'Seat' }])).toBe(false);
    expect(modelCollectionsEqual([model], [{ ...model, previewUrl: 'next.png' }])).toBe(false);
    expect(modelCollectionsEqual([model], [{ ...model, visibility: 'public' }])).toBe(false);
    expect(modelCollectionsEqual([model], [])).toBe(false);
    expect(modelCollectionsEqual([model, table], [table, model])).toBe(false);
  });
});
