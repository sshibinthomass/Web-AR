import type { ModelOption } from './models';

export function createUploadedModelOption(file: File, objectUrl: string, timestamp = Date.now()): ModelOption {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    throw new Error('Choose a .glb model file.');
  }

  const label = modelLabelFromFileName(file.name);
  return {
    id: `uploaded-${timestamp}-${slugify(label)}`,
    label,
    url: objectUrl,
  };
}

function modelLabelFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.glb$/i, '').trim();
  return withoutExtension || 'Uploaded model';
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'model';
}
