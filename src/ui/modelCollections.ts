import type { ModelOption } from '../app/models';

const comparedKeys: Array<keyof ModelOption> = [
  'id',
  'label',
  'url',
  'previewUrl',
  'source',
  'ownerEmail',
  'visibility',
  'createdAt',
  'updatedAt',
  'bytes',
];

export function modelCollectionsEqual(left: ModelOption[], right: ModelOption[]): boolean {
  return left.length === right.length && left.every((model, index) => {
    const candidate = right[index];
    return Boolean(candidate) && comparedKeys.every((key) => model[key] === candidate[key]);
  });
}
