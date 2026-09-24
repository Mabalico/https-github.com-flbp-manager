import { TV_PROJECTIONS, type TvProjection } from '../types';

export const TV_PROJECTION_QUERY_PARAM = 'flbp_tv';

const isTvProjection = (value: string | null): value is TvProjection =>
  Boolean(value) && TV_PROJECTIONS.includes(value as TvProjection);

export const readTvProjectionFromUrl = (href: string): TvProjection | null => {
  try {
    const value = new URL(href).searchParams.get(TV_PROJECTION_QUERY_PARAM);
    return isTvProjection(value) ? value : null;
  } catch {
    return null;
  }
};

export const buildTvProjectionUrl = (href: string, mode: TvProjection): string => {
  const url = new URL(href);
  url.searchParams.set(TV_PROJECTION_QUERY_PARAM, mode);
  // Never copy OAuth/session fragments into the read-only projection window.
  url.hash = '';
  return url.toString();
};
