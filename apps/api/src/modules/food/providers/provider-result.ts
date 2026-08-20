import { ExternalFood } from './provider.types';

/**
 * The outcome of asking one provider for foods.
 *
 * Providers return an empty list in two very different situations: the term
 * genuinely has no matches, or the request failed and was swallowed so the
 * search could carry on. Collapsing both to `[]` meant an unconfigured API key,
 * an outage and a rate limit all looked exactly like "no results" — the search
 * degraded correctly and silently, and nobody could tell it was degraded.
 *
 * This keeps that degradation exactly as it was: callers still read `foods` and
 * still get `[]`. It only makes the difference *visible*.
 */
export type ProviderStatus = 'ok' | 'failed' | 'unconfigured';

export interface ProviderResult {
  status: ProviderStatus;
  foods: ExternalFood[];
}

export const providerOk = (foods: ExternalFood[]): ProviderResult => ({ status: 'ok', foods });

/** The request errored, timed out, or came back non-2xx. */
export const providerFailed = (): ProviderResult => ({ status: 'failed', foods: [] });

/** No credentials, so the provider was never asked. */
export const providerUnconfigured = (): ProviderResult => ({
  status: 'unconfigured',
  foods: [],
});
