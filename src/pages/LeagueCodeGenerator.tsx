import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import './codegen.css';
import FixtureDetails from '../components/FixtureDetails';
import CodeLedger from '../components/CodeLedger';
import { generateCode } from '../utils/codeGenerator';
import {
  Club,
  describeApiError,
  fetchClubPlayers,
  fetchClubProfile,
  fetchLeagueClubs,
  getCacheInfo,
} from '../services/api';
import {
  CodeOptions,
  DEFAULT_CODE_OPTIONS,
  LEAGUE_CODES,
  resolveCaptionFormat,
} from '../constants/config';

/**
 * Wait before the next request, unless the last response came out of the API's cache.
 *
 * The throttling in this page exists to stop Transfermarkt blocking us mid-league. A response the
 * API served from its own cache (`X-Cache: HIT`) never reached Transfermarkt, so there is nothing
 * to throttle after one and a fully cached league can be built at full speed.
 *
 * @param scrapedDelay - Milliseconds to wait when the last response required a scrape
 */
const pauseUnlessCached = (scrapedDelay: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, getCacheInfo()?.status === 'HIT' ? 0 : scrapedDelay);
  });

/**
 * Give every club in the league a key that nothing else is using.
 *
 * One letter where possible, because that is the fastest thing to type. Clubs
 * that collide take more letters of their own name before falling back to a
 * number, so the key still resembles the club it stands for.
 */
const assignPrefixes = (clubs: Club[]): Record<string, string> => {
  const assigned: Record<string, string> = {};
  const taken = new Set<string>();

  clubs.forEach((club) => {
    const letters = club.name.toLowerCase().replace(/[^a-z]/g, '');
    let prefix = '';

    for (let length = 1; length <= letters.length; length++) {
      prefix = letters.slice(0, length);
      if (!taken.has(prefix)) {
        break;
      }
    }

    if (taken.has(prefix)) {
      const base = prefix;
      let counter = 1;
      while (taken.has(prefix)) {
        prefix = `${base}${counter}`;
        counter++;
      }
    }

    taken.add(prefix);
    assigned[club.id] = prefix;
  });

  return assigned;
};

interface BuildError {
  club: string;
  part: 'profile' | 'players';
  detail: string;
}

/**
 * Build one code replacement file covering every club in a league.
 *
 * Unlike the fixture pages this one keeps an explicit build step: it makes two
 * throttled requests per club, so it should only run when you ask it to.
 */
export default function LeagueCodeGenerator(): React.ReactElement {
  const [options, setOptions] = useState<CodeOptions>(DEFAULT_CODE_OPTIONS);
  const [league, setLeague] = useState('');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [code, setCode] = useState('');
  const [building, setBuilding] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [currentClub, setCurrentClub] = useState('');
  const [errors, setErrors] = useState<BuildError[]>([]);

  // Which league the UI is actually showing. A response is applied only if its
  // league is still the selected one — rather than being dropped by a cleanup
  // flag, which strands the roster empty if the effect is torn down and the
  // request is never reissued.
  const shownLeague = useRef('');

  useEffect(() => {
    shownLeague.current = league;

    if (!league) {
      setClubs([]);
      setPrefixes({});
      setIncluded(new Set());
      return;
    }
    setCode('');
    setErrors([]);

    fetchLeagueClubs(LEAGUE_CODES[league])
      .then((data) => {
        if (shownLeague.current !== league) {
          return;
        }
        setClubs(data.clubs);
        setPrefixes(assignPrefixes(data.clubs));
        setIncluded(new Set(data.clubs.map((club) => club.id)));
      })
      .catch((error) => {
        if (shownLeague.current !== league) {
          return;
        }
        console.error('Error loading league clubs:', error);
        toast.error(
          describeApiError(error, `Could not load the clubs in ${league}. Try again in a moment.`)
        );
      });
  }, [league]);

  // A key shared by two included clubs would make one overwrite the other.
  const clashing = useMemo(() => {
    const counts = new Map<string, number>();
    clubs
      .filter((club) => included.has(club.id))
      .forEach((club) => {
        const prefix = prefixes[club.id] ?? '';
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      });
    return new Set(
      [...counts.entries()].filter(([prefix, n]) => prefix !== '' && n > 1).map(([prefix]) => prefix)
    );
  }, [clubs, included, prefixes]);

  const selected = clubs.filter((club) => included.has(club.id));
  const missingPrefix = selected.some((club) => !prefixes[club.id]);

  const toggle = (id: string) =>
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const build = async () => {
    setBuilding(true);
    setDoneCount(0);
    setErrors([]);
    setCode('');

    const collected: string[] = [];
    const failures: BuildError[] = [];

    for (let i = 0; i < selected.length; i++) {
      const club = selected[i];
      const prefix = prefixes[club.id];
      setCurrentClub(club.name);

      if (i > 0) {
        await pauseUnlessCached(2000);
      }

      let profile = null;
      try {
        profile = await fetchClubProfile(club.id);
      } catch (error) {
        failures.push({
          club: club.name,
          part: 'profile',
          detail: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await pauseUnlessCached(500);

      try {
        const squad = await fetchClubPlayers(club.id);
        collected.push(
          generateCode({
            squad1: (squad.players ?? []).map((player) => ({
              number: player.shirtNumber,
              name: player.name,
              position: player.position,
            })),
            squad2: [],
            selectedTeam1: club.name,
            selectedTeam2: '',
            delimiter1: prefix,
            delimiter2: '',
            selectedFormat: resolveCaptionFormat(options),
            sortOption: options.sortOption,
            showInfo: false,
            shouldShorten: options.shouldShorten,
            clubData: profile,
            clubData2: null,
            shouldChangeGoalkeeperStyle: options.shouldChangeGoalkeeperStyle,
            ignoreNoNumberPlayers: !options.includeNoNumberPlayers,
            codeStyle: options.codeStyle,
            nameCodePrefix: options.nameCodePrefix,
            nameCodePosition: options.nameCodePosition,
            initialsCodes: options.initialsCodes,
            initialsDelimiterMode: options.initialsDelimiterMode,
            staffCodes: options.staffCodes,
          })
        );
      } catch (error) {
        failures.push({
          club: club.name,
          part: 'players',
          detail: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      setDoneCount(i + 1);
    }

    // The fixture block belongs at the top of the file, once, above every club.
    const fixtureBlock =
      options.referee || options.competition || options.additionalCodes.trim()
        ? `Ref\tReferee ${options.referee || '-'}\nref\treferee ${options.referee || '-'}\nco\t${
            options.competition
          }\n${options.additionalCodes}\n\n`
        : '';

    const keyMap = selected
      .map((club) => `${prefixes[club.id]}\t${club.name}`)
      .join('\n');

    setCode(`${fixtureBlock}${keyMap}\n\n\n${collected.join('\n\n')}`);
    setCurrentClub('');
    setBuilding(false);

    if (failures.length === 0) {
      toast.success(`${selected.length} clubs added to the file.`);
    } else {
      setErrors(failures);
      toast(`Built with ${failures.length} club${failures.length > 1 ? 's' : ''} missing.`, {
        icon: '⚠️',
      });
    }
  };

  return (
    <div className="workspace">
      <Toaster position="top-right" />

      <div className="workspace-setup">
        <section className="panel">
          <div className="panel-head">
            <h1 className="panel-title">Whole league</h1>
            <span className="eyebrow">Every club, one file</span>
          </div>

          <div className="panel-body stack">
            <div>
              <label className="field-label" htmlFor="league">
                League
              </label>
              <select
                id="league"
                className="select"
                value={league}
                disabled={building}
                onChange={(e) => setLeague(e.target.value)}
              >
                <option value="">Choose a league</option>
                {Object.keys(LEAGUE_CODES).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {clubs.length > 0 && (
              <div>
                <div className="roster-head">
                  <span className="field-label" style={{ marginBottom: 0 }}>
                    Clubs to include
                  </span>
                  <span className="ledger-count">
                    {selected.length} of {clubs.length}
                  </span>
                </div>

                <div className="roster">
                  {clubs.map((club) => {
                    const prefix = prefixes[club.id] ?? '';
                    const isIn = included.has(club.id);
                    const clash = isIn && clashing.has(prefix);

                    return (
                      <div
                        key={club.id}
                        className={`roster-row${isIn ? '' : ' roster-row-out'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isIn}
                          aria-label={`Include ${club.name}`}
                          onChange={() => toggle(club.id)}
                        />
                        <input
                          type="text"
                          className={`roster-key${clash ? ' roster-key-clash' : ''}`}
                          value={prefix}
                          disabled={!isIn}
                          aria-invalid={clash}
                          aria-label={`Key for ${club.name}`}
                          title={clash ? 'Another club is using this key' : undefined}
                          onChange={(e) =>
                            setPrefixes((previous) => ({
                              ...previous,
                              [club.id]: e.target.value.toLowerCase().slice(0, 4),
                            }))
                          }
                        />
                        <span className="roster-name">{club.name}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setIncluded(new Set(clubs.map((club) => club.id)))}
                  >
                    Include all
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setIncluded(new Set())}
                  >
                    Include none
                  </button>
                </div>

                {clashing.size > 0 && (
                  <p className="field-error">
                    {clashing.size === 1 ? 'Two clubs share a key' : `${clashing.size} keys are shared`}
                    . Give each club its own so the codes don&rsquo;t overwrite one another.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="panel-foot" style={{ display: 'block' }}>
            <button
              type="button"
              className="btn"
              disabled={building || selected.length === 0 || clashing.size > 0 || missingPrefix}
              onClick={build}
            >
              {building
                ? `Building… ${doneCount} of ${selected.length}`
                : selected.length
                  ? `Build file for ${selected.length} club${selected.length === 1 ? '' : 's'}`
                  : 'Build file'}
            </button>

            {building && (
              <div className="progress" role="status" aria-live="polite">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${selected.length ? (doneCount / selected.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="field-hint">
                  {currentClub ? `Fetching ${currentClub}` : 'Finishing up'} · pauses between
                  clubs so Transfermarkt doesn&rsquo;t block the run
                </p>
              </div>
            )}

            {!building && !code && selected.length > 0 && (
              <p className="field-hint">
                Two requests per club, spaced out — a full league takes a couple of minutes.
              </p>
            )}
          </div>
        </section>

        {errors.length > 0 && (
          <div className="notice notice-signal">
            <div>
              <strong>
                {errors.length} club{errors.length > 1 ? 's' : ''} came back incomplete
              </strong>
              <ul className="error-list">
                {errors.map((error) => (
                  <li key={`${error.club}-${error.part}`}>
                    {error.club} — no {error.part}
                  </li>
                ))}
              </ul>
              Those clubs are missing from the file. Rebuilding usually picks them up.
            </div>
          </div>
        )}

        <FixtureDetails options={options} setOptions={setOptions} />
      </div>

      <CodeLedger
        code={code}
        homePrefix=""
        awayPrefix=""
        namePrefix={options.nameCodePrefix}
        namePosition={options.nameCodePosition}
        filename={`${league.replace(/\s+/g, '-').toLowerCase() || 'league'}-codes`}
        busy={building}
        generation={`${league}:${doneCount}`}
        emptyTitle="No league built yet"
        emptyText="Choose a league, check the clubs and their keys, then build the file."
        busyTitle="Building the league"
        busyText="Each club is fetched in turn, with a pause in between."
      />
    </div>
  );
}
