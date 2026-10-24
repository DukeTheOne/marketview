import type { ChartAnnotationType } from '../../../core/schemas/annotation';
import type { ChartOverlayPlugin } from './types';

class OverlayPluginRegistry {
  private readonly plugins = new Map<ChartAnnotationType, ChartOverlayPlugin<any>>();

  public register<TPayload>(plugin: ChartOverlayPlugin<TPayload>): void {
    this.plugins.set(plugin.type, plugin);
  }

  public get<TPayload = any>(
    type: ChartAnnotationType
  ): ChartOverlayPlugin<TPayload> | undefined {
    return this.plugins.get(type);
  }

  public getAll(): Array<ChartOverlayPlugin<any>> {
    return Array.from(this.plugins.values());
  }
}

export const overlayPluginRegistry = new OverlayPluginRegistry();
