export interface StageRectangle { x: number; y: number; w: number; h: number }
export type SkyPolygon = [number, number][];
export interface ProgramVisual {
  id: string; art: string | null; genre: string; font: 'cut' | 'tech' | 'retro';
  layout: 'left' | 'right' | 'center'; accent: string; secondary: string;
  strength: number; mode: 'background' | 'overlay'; protectedAreas: StageRectangle[];
  skyRegions: SkyPolygon[]; overlayUIAreas: StageRectangle[]; backgroundUIAreas: StageRectangle[];
  cue: { x: number; y: number; w: number; bottom?: number } | null;
}
export const PROGRAM_VISUALS: Readonly<Record<string, ProgramVisual>>;
export const ART_SKY_REGIONS: Readonly<Record<string, SkyPolygon[]>>;
export const DEFAULT_PROGRAM_VISUAL: ProgramVisual;
export function programVisual(program?: { id?: string }, stage?: { mode?: string }): ProgramVisual;
export function hasProgramArtwork(program?: { id?: string }): boolean;
export function persistentProgramCredits(program?: { id?: string; kind?: string }, stage?: { mode?: string }): boolean;
export function programVisualStyle(visual?: ProgramVisual): Record<string, string | number>;
