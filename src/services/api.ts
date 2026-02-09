import { API_BASE_URL } from '../constants/config';

const REQUEST_TIMEOUT = 30000;

const fetchWithTimeout = async (url: string, timeout = REQUEST_TIMEOUT): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    throw error;
  }
};

// Type definitions for API responses
export interface Club {
  id: string;
  name: string;
  country?: string;
}

export interface Player {
  id?: string;
  name: string;
  shirtNumber?: string | number;
  position: string;
}

export interface ClubProfile {
  id?: string;
  name?: string;
  stadiumName?: string;
  addressLine3?: string;
  manager?: string;
}

export interface LeagueClubsResponse {
  clubs: Club[];
}

export interface PlayersResponse {
  players: Player[];
}

export interface SearchResponse {
  results: Club[];
}

export const fetchLeagueClubs = async (competitionCode: string): Promise<LeagueClubsResponse> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/competitions/${competitionCode}/clubs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch clubs for competition ${competitionCode}`);
  }
  return response.json();
};

/**
 * Fetch club profile by club ID
 * @param clubId - The club ID
 * @returns Club profile data
 */
export const fetchClubProfile = async (clubId: string): Promise<ClubProfile> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/clubs/${clubId}/profile`);
  if (!response.ok) {
    throw new Error(`Failed to fetch profile for club ${clubId}`);
  }
  return response.json();
};

/**
 * Fetch club players by club ID
 * @param clubId - The club ID
 * @returns Response containing players array
 */
export const fetchClubPlayers = async (clubId: string): Promise<PlayersResponse> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/clubs/${clubId}/players`);
  if (!response.ok) {
    throw new Error(`Failed to fetch players for club ${clubId}`);
  }
  return response.json();
};

/**
 * Search for clubs by name
 * @param searchTerm - The search term
 * @returns Response containing search results
 */
export const searchClubs = async (searchTerm: string): Promise<SearchResponse> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/clubs/search/${encodeURIComponent(searchTerm)}`);
  if (!response.ok) {
    throw new Error(`Failed to search for clubs with term "${searchTerm}"`);
  }
  return response.json();
};

/**
 * Fetch full squad data for code generation
 * @param clubId - The club ID
 * @returns Object containing both profile and player data
 */
export const fetchFullSquadData = async (clubId: string): Promise<{ profile: ClubProfile | null; players: PlayersResponse }> => {
  const [profile, players] = await Promise.all([
    fetchClubProfile(clubId).catch(() => null),
    fetchClubPlayers(clubId)
  ]);
  
  return { profile, players };
};
