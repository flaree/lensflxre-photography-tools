import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Club,
  ClubProfile,
  Player,
  describeApiError,
  fetchFullSquadData,
} from '../services/api';
import { generateCode } from '../utils/codeGenerator';
import { CodeOptions, resolveCaptionFormat } from '../constants/config';

export interface TeamSlot {
  club: Club | null;
  profile: ClubProfile | null;
  players: Player[];
  loading: boolean;
}

const EMPTY_SLOT: TeamSlot = { club: null, profile: null, players: [], loading: false };

/**
 * Pick a prefix that isn't already in use by the other team.
 *
 * The first letter of the club name is what a photographer would reach for, so
 * try that first, then the rest of the name, then the alphabet. Resolving the
 * clash here means the two teams are never silently given the same key.
 */
export const suggestPrefix = (name: string, taken: string): string => {
  const candidates = [
    ...name.toLowerCase().replace(/[^a-z]/g, ''),
    ...'abcdefghijklmnopqrstuvwxyz',
  ];
  return candidates.find((letter) => letter !== taken) ?? '';
};

interface UseMatchFileReturn {
  home: TeamSlot;
  away: TeamSlot;
  homePrefix: string;
  awayPrefix: string;
  setHomePrefix: (_value: string) => void;
  setAwayPrefix: (_value: string) => void;
  selectHome: (_club: Club | null) => void;
  selectAway: (_club: Club | null) => void;
  clearAway: () => void;
  /** The complete code replacement file, recomputed as settings change. */
  code: string;
  /** Changes whenever a squad lands, so the ledger can mark the moment. */
  generation: string;
  prefixClash: boolean;
  busy: boolean;
}

/**
 * Hold the two squads and derive the code replacement file from them.
 *
 * Squads are fetched once, when a club is chosen, and kept. Every other
 * control — caption format, sort order, prefixes, fixture details — reshapes
 * the file from data already in memory, so changing your mind costs nothing
 * and never touches Transfermarkt again.
 */
export const useMatchFile = (options: CodeOptions): UseMatchFileReturn => {
  const [home, setHome] = useState<TeamSlot>(EMPTY_SLOT);
  const [away, setAway] = useState<TeamSlot>(EMPTY_SLOT);
  const [homePrefix, setHomePrefix] = useState('');
  const [awayPrefix, setAwayPrefix] = useState('');

  const selectHome = useCallback(
    (club: Club | null) => {
      setHome({ ...EMPTY_SLOT, club, loading: Boolean(club) });
      if (club) {
        setHomePrefix((current) => current || suggestPrefix(club.name, awayPrefix));
      }
    },
    [awayPrefix]
  );

  const selectAway = useCallback(
    (club: Club | null) => {
      setAway({ ...EMPTY_SLOT, club, loading: Boolean(club) });
      if (club) {
        setAwayPrefix((current) => current || suggestPrefix(club.name, homePrefix));
      }
    },
    [homePrefix]
  );

  const clearAway = useCallback(() => {
    setAway(EMPTY_SLOT);
    setAwayPrefix('');
  }, []);

  // One fetch per club chosen. Late responses for a club that has since been
  // swapped out are dropped rather than overwriting the current squad.
  const loadSquad = (
    club: Club | null,
    apply: React.Dispatch<React.SetStateAction<TeamSlot>>,
    role: string
  ) => {
    if (!club) {
      return undefined;
    }
    let cancelled = false;

    fetchFullSquadData(club.id)
      .then(({ profile, players }) => {
        if (cancelled) {
          return;
        }
        apply((slot) =>
          slot.club?.id === club.id
            ? { club, profile, players: players.players ?? [], loading: false }
            : slot
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(`Error loading ${role} squad:`, error);
        apply((slot) => (slot.club?.id === club.id ? { ...slot, loading: false } : slot));
        toast.error(
          describeApiError(error, `Could not load the ${role} squad. Try again in a moment.`)
        );
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => loadSquad(home.club, setHome, 'home'), [home.club]);
  useEffect(() => loadSquad(away.club, setAway, 'away'), [away.club]);

  const prefixClash =
    Boolean(homePrefix) && Boolean(awayPrefix) && homePrefix === awayPrefix && Boolean(away.club);

  const code = useMemo(() => {
    if (!home.club || home.players.length === 0) {
      return '';
    }
    const toEntry = (player: Player) => ({
      number: player.shirtNumber,
      name: player.name,
      position: player.position,
    });

    return generateCode({
      squad1: home.players.map(toEntry),
      squad2: away.players.map(toEntry),
      selectedTeam1: home.club.name,
      selectedTeam2: away.club?.name ?? '',
      delimiter1: homePrefix,
      delimiter2: awayPrefix,
      selectedFormat: resolveCaptionFormat(options),
      sortOption: options.sortOption,
      // The fixture block is in the file whenever there is something to put in
      // it. It used to be gated on the options panel being expanded, so
      // collapsing the panel silently dropped the referee and competition.
      showInfo: Boolean(
        options.referee || options.competition || options.additionalCodes.trim()
      ),
      referee: options.referee,
      competition: options.competition,
      additionalCodes: options.additionalCodes,
      shouldShorten: options.shouldShorten,
      clubData: home.profile,
      clubData2: away.profile,
      shouldChangeGoalkeeperStyle: options.shouldChangeGoalkeeperStyle,
      ignoreNoNumberPlayers: !options.includeNoNumberPlayers,
      codeStyle: options.codeStyle,
      nameCodePrefix: options.nameCodePrefix,
      nameCodePosition: options.nameCodePosition,
      initialsCodes: options.initialsCodes,
      initialsDelimiterMode: options.initialsDelimiterMode,
      staffCodes: options.staffCodes,
    });
  }, [home, away, homePrefix, awayPrefix, options]);

  return {
    home,
    away,
    homePrefix,
    awayPrefix,
    setHomePrefix,
    setAwayPrefix,
    selectHome,
    selectAway,
    clearAway,
    code,
    generation: `${home.club?.id ?? '-'}:${home.players.length}:${away.club?.id ?? '-'}:${away.players.length}`,
    prefixClash,
    busy: home.loading || away.loading,
  };
};
