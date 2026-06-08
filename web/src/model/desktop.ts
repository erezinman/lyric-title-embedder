// web/src/model/desktop.ts — feature-detect the Electron preload bridge. In a plain
// browser there is no window.kss, so isDesktop is false and the pickers are no-ops.
export interface PickOpts {
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}
type Picker = (opts?: PickOpts) => Promise<string | null>;
interface KssBridge { isDesktop: boolean; pickOpen: Picker; pickSave: Picker; }

const bridge = (globalThis as unknown as { kss?: KssBridge }).kss;

export const isDesktop: boolean = !!bridge?.isDesktop;
export const pickOpen: Picker = (opts) => (bridge ? bridge.pickOpen(opts) : Promise.resolve(null));
export const pickSave: Picker = (opts) => (bridge ? bridge.pickSave(opts) : Promise.resolve(null));
