import { describe, expect, it, vi } from 'vitest';
import {
  extractImageFor3D,
  deleteGeneratedModel,
  generateModelFromImage,
  listAdminJobs,
  listGeneratedModels,
  renameGeneratedModel,
  retryAdminJob,
  startGeneratedModelJob,
  storeUploadedModel,
  toggleGeneratedModelVisibility,
  cleanupFailedJobArtifacts,
  updateGeneratedModelThumbnail,
} from '../../src/services/generatedModelClient';

describe('extractImageFor3D', () => {
  it('submits the captured image and target object to the Worker extraction endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          image_base64: 'extracted-image-base64',
          image_mime_type: 'image/png',
          target_object: 'laptop',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await extractImageFor3D({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/png',
      targetObject: ' laptop ',
      authToken: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/extract-image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-token' },
        body: JSON.stringify({
          image_base64: 'abc123',
          image_mime_type: 'image/png',
          target_object: 'laptop',
        }),
      }),
    );
    expect(result).toEqual({
      imageBase64: 'extracted-image-base64',
      imageMimeType: 'image/png',
      targetObject: 'laptop',
    });
  });
});

describe('startGeneratedModelJob', () => {
  it('starts a Worker job without polling for the final GLB', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'fc-123',
          label: '2026-06-28 12:00:00 UTC',
          status: 'running',
          status_url: 'https://worker.example/generate-3d/jobs/fc-123',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const job = await startGeneratedModelJob({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(job).toEqual({
      id: 'fc-123',
      label: '2026-06-28 12:00:00 UTC',
      status: 'running',
      statusUrl: 'https://worker.example/generate-3d/jobs/fc-123',
    });
  });

  it('sends trimmed target object when starting a Worker job', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'fc-123',
          status_url: 'https://worker.example/generate-3d/jobs/fc-123',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await startGeneratedModelJob({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      targetObject: ' laptop ',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d',
      expect.objectContaining({
        body: JSON.stringify({
          image_base64: 'abc123',
          image_mime_type: 'image/jpeg',
          target_object: 'laptop',
        }),
      }),
    );
  });

  it('uses the direct OpenAI-to-3D Worker endpoint when requested', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'openai-123',
          status_url: 'https://worker.example/generate-3d/jobs/openai-123',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await startGeneratedModelJob({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'captured-image-base64',
      imageMimeType: 'image/jpeg',
      targetObject: ' laptop ',
      generationPipeline: 'openai-to-3d',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/openai',
      expect.objectContaining({
        body: JSON.stringify({
          image_base64: 'captured-image-base64',
          image_mime_type: 'image/jpeg',
          target_object: 'laptop',
        }),
      }),
    );
  });
});

describe('listGeneratedModels', () => {
  it('loads permanent generated models for the dropdown', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              id: 'fc-123',
              label: '2026-06-28 12:00:00 UTC',
              model_url: 'https://assets.example/generated.glb',
              object_key: 'models/generated/capture.glb',
              preview_url: 'https://assets.example/previews/capture.png',
              owner_email: 'maker@example.com',
              visibility: 'private',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const models = await listGeneratedModels({
      apiUrl: 'https://worker.example/generate-3d',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/generate-3d/models');
    expect(models).toEqual([
      {
        id: 'generated-fc-123',
        label: '2026-06-28 12:00:00 UTC',
        url: 'https://assets.example/generated.glb',
        previewUrl: 'https://assets.example/previews/capture.png',
        ownerEmail: 'maker@example.com',
        visibility: 'private',
      },
    ]);
  });

  it('sends the bearer token when listing models for a signed-in user', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await listGeneratedModels({
      apiUrl: 'https://worker.example/generate-3d',
      authToken: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/generate-3d/models', {
      headers: { Authorization: 'Bearer signed-token' },
    });
  });

  it('sends the bearer token when starting a protected Worker job', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'fc-123',
          status_url: 'https://worker.example/generate-3d/jobs/fc-123',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await startGeneratedModelJob({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      authToken: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-token' },
      }),
    );
  });
});

describe('storeUploadedModel', () => {
  it('uploads a GLB to Worker storage and returns the stored model option', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'upload-20260704-120000-living-room-chair',
          label: 'Living Room Chair',
          model_url: 'https://assets.example/models/generated/uploads/upload-20260704-120000-living-room-chair.glb',
          object_key: 'models/generated/uploads/upload-20260704-120000-living-room-chair.glb',
          source: 'uploaded',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const file = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], 'Living Room Chair.glb', {
      type: 'model/gltf-binary',
    });

    const model = await storeUploadedModel({
      apiUrl: 'https://worker.example/generate-3d',
      file,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: 'Living Room Chair.glb',
          label: 'Living Room Chair',
          model_mime_type: 'model/gltf-binary',
          model_base64: 'Z2xURg==',
        }),
      }),
    );
    expect(model).toEqual({
      id: 'generated-upload-20260704-120000-living-room-chair',
      label: 'Living Room Chair',
      url: 'https://assets.example/models/generated/uploads/upload-20260704-120000-living-room-chair.glb',
      source: 'uploaded',
    });
  });

  it('sends the bearer token when storing an uploaded model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'upload-20260704-120000-living-room-chair',
          label: 'Living Room Chair',
          model_url: 'https://assets.example/model.glb',
          object_key: 'models/generated/uploads/model.glb',
          source: 'uploaded',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const file = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], 'Living Room Chair.glb', {
      type: 'model/gltf-binary',
    });

    await storeUploadedModel({
      apiUrl: 'https://worker.example/generate-3d',
      file,
      authToken: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/upload',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-token' },
      }),
    );
  });
});

describe('renameGeneratedModel', () => {
  it('renames a permanent generated model by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'fc-123',
          label: 'Living room chair',
          model_url: 'https://assets.example/generated-chair.glb',
          object_key: 'models/generated/generated-chair.glb',
          preview_url: 'https://assets.example/previews/generated-chair.png',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const model = await renameGeneratedModel({
      apiUrl: 'https://worker.example/generate-3d',
      modelId: 'generated-fc-123',
      label: '  Living room chair  ',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/fc-123',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Living room chair' }),
      }),
    );
    expect(model).toEqual({
      id: 'generated-fc-123',
      label: 'Living room chair',
      url: 'https://assets.example/generated-chair.glb',
      previewUrl: 'https://assets.example/previews/generated-chair.png',
    });
  });

  it('requires a non-empty generated model label when renaming', async () => {
    await expect(
      renameGeneratedModel({
        apiUrl: 'https://worker.example/generate-3d',
        modelId: 'generated-fc-123',
        label: '   ',
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow('Enter a model name before renaming.');
  });
});

describe('toggleGeneratedModelVisibility', () => {
  it('updates a generated model visibility state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'fc-123',
          label: 'Living room chair',
          model_url: 'https://assets.example/generated-chair.glb',
          object_key: 'models/generated/generated-chair.glb',
          visibility: 'public',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const model = await toggleGeneratedModelVisibility({
      apiUrl: 'https://worker.example/generate-3d',
      modelId: 'generated-fc-123',
      visibility: 'public',
      authToken: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/fc-123',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-token' },
        body: JSON.stringify({ visibility: 'public' }),
      }),
    );
    expect(model.visibility).toBe('public');
  });
});

describe('admin job operations', () => {
  it('lists jobs, retries a job, and requests failed-artifact cleanup', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobs: [
              {
                id: 'fc-123',
                label: 'Chair',
                status: 'failed',
                error: 'Modal exploded',
                owner_email: 'maker@example.com',
                created_at: '2026-07-04T12:00:00.000Z',
                updated_at: '2026-07-04T12:05:00.000Z',
                bytes: 4096,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'fc-123', status: 'running' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cleaned: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      listAdminJobs({ apiUrl: 'https://worker.example/generate-3d', authToken: 'admin-token', fetchImpl }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'fc-123',
        status: 'failed',
        error: 'Modal exploded',
        ownerEmail: 'maker@example.com',
        bytes: 4096,
      }),
    ]);
    await expect(
      retryAdminJob({
        apiUrl: 'https://worker.example/generate-3d',
        jobId: 'fc-123',
        authToken: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'fc-123', status: 'running' }));
    await expect(
      cleanupFailedJobArtifacts({
        apiUrl: 'https://worker.example/generate-3d',
        authToken: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toEqual({ cleaned: 2 });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://worker.example/generate-3d/jobs', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://worker.example/generate-3d/jobs/fc-123/retry',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer admin-token' } }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://worker.example/generate-3d/jobs/cleanup',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer admin-token' } }),
    );
  });
});

describe('updateGeneratedModelThumbnail', () => {
  it('uploads a compressed thumbnail for a permanent generated model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'fc-123',
          label: 'Living room chair',
          model_url: 'https://assets.example/generated-chair.glb',
          object_key: 'models/generated/generated-chair.glb',
          preview_url: 'https://assets.example/previews/generated-chair.webp',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const model = await updateGeneratedModelThumbnail({
      apiUrl: 'https://worker.example/generate-3d',
      modelId: 'generated-fc-123',
      thumbnail: {
        base64: 'compressed-thumbnail-base64',
        bytes: 256,
        height: 256,
        mimeType: 'image/webp',
        width: 512,
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/fc-123',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_base64: 'compressed-thumbnail-base64',
          preview_mime_type: 'image/webp',
        }),
      }),
    );
    expect(model).toEqual({
      id: 'generated-fc-123',
      label: 'Living room chair',
      url: 'https://assets.example/generated-chair.glb',
      previewUrl: 'https://assets.example/previews/generated-chair.webp',
    });
  });
});

describe('deleteGeneratedModel', () => {
  it('deletes a permanent generated model by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true, id: 'fc-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await deleteGeneratedModel({
      apiUrl: 'https://worker.example/generate-3d',
      modelId: 'generated-fc-123',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/generate-3d/models/fc-123',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });
});

describe('generateModelFromImage', () => {
  it('posts the captured image to the Worker and returns the generated model result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'fc-123',
            status_url: 'https://worker.example/generate-3d/jobs/fc-123',
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'running' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_url: 'https://assets.example/models/generated/capture.glb',
            object_key: 'models/generated/capture.glb',
            bytes: 4,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const result = await generateModelFromImage({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      targetObject: ' laptop ',
      fetchImpl,
      pollIntervalMs: 0,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://worker.example/generate-3d',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: 'abc123',
          image_mime_type: 'image/jpeg',
          target_object: 'laptop',
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://worker.example/generate-3d/jobs/fc-123');
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'https://worker.example/generate-3d/jobs/fc-123');
    expect(result).toEqual({
      modelUrl: 'https://assets.example/models/generated/capture.glb',
      objectKey: 'models/generated/capture.glb',
      bytes: 4,
    });
  });

  it('uses the bearer token for full-flow generation and status polling', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'fc-123',
            status_url: 'https://worker.example/generate-3d/jobs/fc-123',
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_url: 'https://assets.example/models/generated/capture.glb',
            object_key: 'models/generated/capture.glb',
            bytes: 4,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    await generateModelFromImage({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      authToken: 'signed-token',
      fetchImpl,
      pollIntervalMs: 0,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://worker.example/generate-3d',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-token' },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://worker.example/generate-3d/jobs/fc-123', {
      headers: { Authorization: 'Bearer signed-token' },
    });
  });

  it('polls a direct OpenAI-to-3D full-flow job from the direct Worker endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'openai-123',
            status_url: 'https://worker.example/generate-3d/jobs/openai-123',
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_url: 'https://assets.example/models/generated/openai.glb',
            object_key: 'models/generated/openai.glb',
            bytes: 4,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    await generateModelFromImage({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'captured-image-base64',
      imageMimeType: 'image/jpeg',
      targetObject: ' laptop ',
      generationPipeline: 'openai-to-3d',
      fetchImpl,
      pollIntervalMs: 0,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://worker.example/generate-3d/openai',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://worker.example/generate-3d/jobs/openai-123');
  });

  it('throws the Worker error message when generation fails', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Modal job start failed: nope' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      }),
    ).rejects.toThrow('Modal job start failed: nope');
  });

  it('stops polling when the generated model is not ready in time', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                job_id: 'fc-123',
                status_url: 'https://worker.example/generate-3d/jobs/fc-123',
              }),
              {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          )
          .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ status: 'running' }), { status: 202 }))),
        maxPolls: 2,
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow('Generation is still running. Try again in a moment.');
  });

  it('requires a configured Worker API URL', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: '',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow('Worker API URL is not configured.');
  });
});
