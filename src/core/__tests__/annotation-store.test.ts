import { describe, expect, it } from 'vitest';
import { InMemoryStorageRepository } from '../repositories/InMemoryStorageRepository';
import { createAnnotationStore } from '../stores/annotationStore';

describe('Chart Annotation Headless Store (TC-M2-03)', () => {
  it('manages annotation CRUD lifecycle and persists through StorageRepository', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createAnnotationStore(repo, () => 1729728000);

    await store.getState().hydrate();
    expect(store.getState().annotations).toEqual([]);

    // Add a sticker annotation
    const sticker = await store.getState().addAnnotation({
      ticker: 'aapl',
      type: 'sticker',
      anchors: [{ timestamp: 1729728000, price: 228.5 }],
      payload: { markdown: 'Key resistance retest', color: 'emerald' },
    });

    expect(sticker.id).toMatch(/^ann-/);
    expect(sticker.ticker).toBe('AAPL');
    expect(store.getState().annotations.length).toBe(1);
    expect(store.getState().selectedAnnotationId).toBe(sticker.id);

    // Update annotation payload
    await store.getState().updateAnnotation(sticker.id, {
      payload: { markdown: 'Updated note after breakout', color: 'amber' },
    });

    const updated = store.getState().annotations[0];
    expect(updated?.payload['markdown']).toBe('Updated note after breakout');
    expect(updated?.payload['color']).toBe('amber');

    // Update anchors (e.g. user drags pin to new candle)
    await store.getState().updateAnnotation(sticker.id, {
      anchors: [{ timestamp: 1729731600, price: 230.0 }],
    });
    expect(store.getState().annotations[0]?.anchors[0]).toEqual({
      timestamp: 1729731600,
      price: 230.0,
    });

    // Verify ticker isolation
    const aaplNotes = store.getState().getAnnotationsForTicker('AAPL');
    const nvdaNotes = store.getState().getAnnotationsForTicker('NVDA');
    expect(aaplNotes.length).toBe(1);
    expect(nvdaNotes.length).toBe(0);

    // Verify persistence across new store instance
    const store2 = createAnnotationStore(repo, () => 1729732000);
    const rehydrated = await store2.getState().hydrate();
    expect(rehydrated.length).toBe(1);
    expect(rehydrated[0]?.id).toBe(sticker.id);

    // Delete annotation
    await store2.getState().deleteAnnotation(sticker.id);
    expect(store2.getState().annotations.length).toBe(0);
    expect(store2.getState().selectedAnnotationId).toBeNull();
  });

  it('manages active tool selection and deselects current annotation when tool changes', () => {
    const repo = new InMemoryStorageRepository();
    const store = createAnnotationStore(repo);

    store.getState().selectAnnotation('ann-123');
    expect(store.getState().selectedAnnotationId).toBe('ann-123');

    store.getState().setActiveTool('sticker');
    expect(store.getState().activeTool).toBe('sticker');
    expect(store.getState().selectedAnnotationId).toBeNull();

    store.getState().setActiveTool(null);
    expect(store.getState().activeTool).toBeNull();
  });
});
