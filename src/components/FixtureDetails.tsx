import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CAPTION_PLACEHOLDERS,
  CODE_STYLES,
  INITIALS_DELIMITER_MODES,
  NAME_CODE_POSITIONS,
  CodeOptions,
} from '../constants/config';
import { playerInitials } from '../utils/codeGenerator';

const STORAGE_KEY = 'code_generator_additional_options';

interface SamplePlayer {
  name: string;
  number: string | number;
  position?: string;
}

interface FixtureDetailsProps {
  options: CodeOptions;
  setOptions: React.Dispatch<React.SetStateAction<CodeOptions>>;
  /** Used to render caption formats as real sentences instead of templates. */
  sampleTeam?: string;
  samplePlayer?: SamplePlayer | null;
}

/**
 * Render a caption format with real names in it.
 *
 * The stored formats are templates like `{playerName} of {team}`. Nobody
 * captions a photo in template syntax, so the picker shows the sentence each
 * option produces for a player already on the sheet.
 */
const renderFormat = (
  format: string,
  team: string,
  player: SamplePlayer
): string =>
  [
    ['{playerName}', player.name],
    ['{team}', team],
    ['{shirtNumber}', String(player.number)],
    ['{position}', player.position || '-'],
  ].reduce((result, [token, value]) => result.split(token).join(value), format);

/**
 * Everything about the fixture that isn't the two squads.
 *
 * Collapsed by default because most matchdays don't need it, but the summary
 * line says what is set so you can tell at a glance whether to open it.
 */
export default function FixtureDetails({
  options,
  setOptions,
  sampleTeam = 'Bohemians',
  samplePlayer,
}: FixtureDetailsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const player = samplePlayer ?? { name: 'Dawson Devoy', number: 10, position: 'Midfielder' };
  const namePrefix = options.nameCodePrefix || '.';
  const nameCodeExample =
    options.nameCodePosition === NAME_CODE_POSITIONS.SUFFIX ? `b1${namePrefix}` : `${namePrefix}b1`;
  // Shown against a real squad member so the example is the code they'd type.
  const initials = playerInitials(player.name) || 'tf';

  const set = <K extends keyof CodeOptions>(key: K, value: CodeOptions[K]): void => {
    setOptions((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored);
      setOptions((previous) => ({
        ...previous,
        shouldShorten: parsed.shouldShorten ?? previous.shouldShorten,
        selectedDate: parsed.selectedDate ?? previous.selectedDate,
        referee: parsed.referee ?? previous.referee,
        competition: parsed.competition ?? previous.competition,
        additionalCodes: parsed.additionalCodes ?? previous.additionalCodes,
        sortOption: parsed.sortOption ?? previous.sortOption,
        selectedFormat: parsed.selectedFormat ?? previous.selectedFormat,
        customFormat: parsed.customFormat ?? previous.customFormat,
        useCustomFormat: parsed.useCustomFormat ?? previous.useCustomFormat,
        shouldChangeGoalkeeperStyle:
          parsed.shouldChangeGoalkeeperStyle ?? previous.shouldChangeGoalkeeperStyle,
        includeNoNumberPlayers:
          parsed.includeNoNumberPlayers ?? previous.includeNoNumberPlayers,
        codeStyle: parsed.codeStyle ?? previous.codeStyle,
        nameCodePrefix: parsed.nameCodePrefix ?? previous.nameCodePrefix,
        nameCodePosition: parsed.nameCodePosition ?? previous.nameCodePosition,
        initialsCodes: parsed.initialsCodes ?? previous.initialsCodes,
        initialsDelimiterMode: parsed.initialsDelimiterMode ?? previous.initialsDelimiterMode,
        staffCodes: parsed.staffCodes ?? previous.staffCodes,
      }));
      setSaved(true);
    } catch {
      // A corrupt entry just means we start from the defaults.
    }
  }, [setOptions]);

  const save = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          shouldShorten: options.shouldShorten,
          selectedDate: options.selectedDate,
          referee: options.referee,
          competition: options.competition,
          additionalCodes: options.additionalCodes,
          sortOption: options.sortOption,
          selectedFormat: options.selectedFormat,
          customFormat: options.customFormat,
          useCustomFormat: options.useCustomFormat,
          shouldChangeGoalkeeperStyle: options.shouldChangeGoalkeeperStyle,
          includeNoNumberPlayers: options.includeNoNumberPlayers,
          codeStyle: options.codeStyle,
          nameCodePrefix: options.nameCodePrefix,
          nameCodePosition: options.nameCodePosition,
          initialsCodes: options.initialsCodes,
          initialsDelimiterMode: options.initialsDelimiterMode,
          staffCodes: options.staffCodes,
        })
      );
      setSaved(true);
      toast.success('Saved. These settings load with every new fixture.');
    } catch {
      toast.error('Your browser blocked local storage, so these settings were not saved.');
    }
  };

  const clear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSaved(false);
      toast.success('Cleared. New fixtures start from the defaults.');
    } catch {
      toast.error('Your browser blocked local storage, so nothing was cleared.');
    }
  };

  // Say what is actually set, so the panel doesn't have to be opened to check.
  const summary = [
    options.competition,
    options.referee && `Ref ${options.referee}`,
    options.selectedDate,
    options.additionalCodes.trim() && 'extra codes',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`disclosure ${open ? 'disclosure-open' : ''}`}>
      <button
        type="button"
        className="disclosure-summary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="disclosure-chevron" aria-hidden="true" />
        <span className="disclosure-summary-label">
          Fixture details and caption format
          {summary && <span className="field-hint">{summary}</span>}
        </span>
        {saved && <span className="tag tag-ok">Saved</span>}
      </button>

      {open && (
        <div className="disclosure-panel">
          <div className="stack">
            <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend className="field-label" style={{ padding: 0 }}>
                Caption format
              </legend>
              <div className="format-list">
                {options.formats.map((format) => (
                  <label
                    key={format}
                    className={`format-option ${
                      !options.useCustomFormat && options.selectedFormat === format
                        ? 'format-option-checked'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="caption-format"
                      value={format}
                      checked={!options.useCustomFormat && options.selectedFormat === format}
                      onChange={() => {
                        set('selectedFormat', format);
                        set('useCustomFormat', false);
                      }}
                    />
                    <span className="format-option-sample">
                      {renderFormat(format, sampleTeam, player)}
                    </span>
                  </label>
                ))}
                <label
                  className={`format-option ${options.useCustomFormat ? 'format-option-checked' : ''}`}
                >
                  <input
                    type="radio"
                    name="caption-format"
                    checked={options.useCustomFormat}
                    onChange={() => set('useCustomFormat', true)}
                  />
                  <span className="format-option-sample">Custom</span>
                </label>
              </div>

              {options.useCustomFormat && (
                <div style={{ marginTop: 8 }}>
                  <input
                    id="fx-custom-format"
                    type="text"
                    className="input"
                    value={options.customFormat}
                    placeholder="{playerName} #{shirtNumber} of {team}"
                    onChange={(e) => set('customFormat', e.target.value)}
                  />
                  <p className="field-hint">
                    Build your own with{' '}
                    {CAPTION_PLACEHOLDERS.map((token, index) => (
                      <React.Fragment key={token}>
                        {index > 0 && ', '}
                        <code>{token}</code>
                      </React.Fragment>
                    ))}
                    .{' '}
                    {options.customFormat.trim() ? (
                      <>
                        Preview: &ldquo;{renderFormat(options.customFormat, sampleTeam, player)}
                        &rdquo;
                      </>
                    ) : (
                      'Leave it blank to fall back to the format selected above.'
                    )}
                  </p>
                </div>
              )}
            </fieldset>

            <div>
              <span className="field-label">Code style</span>
              <div className="stack-sm">
                <label className="check">
                  <input
                    type="radio"
                    name="code-style"
                    checked={options.codeStyle === CODE_STYLES.SIMPLE}
                    onChange={() => set('codeStyle', CODE_STYLES.SIMPLE)}
                  />
                  <span className="check-text">
                    Simple: <code>b1</code> + <code>{nameCodeExample}</code>
                    <span className="check-sub">
                      <code>b1</code> types the full caption, <code>{nameCodeExample}</code> types
                      just the name. No template setup needed.
                    </span>
                  </span>
                </label>
                {options.codeStyle === CODE_STYLES.SIMPLE && (
                  <div style={{ marginLeft: 25 }}>
                    <div className="grid-2">
                      <div>
                        <label className="field-label" htmlFor="fx-name-prefix">
                          Name-only code mark
                        </label>
                        <input
                          id="fx-name-prefix"
                          type="text"
                          className="input"
                          style={{ maxWidth: 80 }}
                          value={options.nameCodePrefix}
                          maxLength={3}
                          onChange={(e) => set('nameCodePrefix', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="fx-name-position">
                          Position
                        </label>
                        <select
                          id="fx-name-position"
                          className="select"
                          value={options.nameCodePosition}
                          onChange={(e) =>
                            set(
                              'nameCodePosition',
                              e.target.value as CodeOptions['nameCodePosition']
                            )
                          }
                        >
                          <option value={NAME_CODE_POSITIONS.PREFIX}>Before the key (.b1)</option>
                          <option value={NAME_CODE_POSITIONS.SUFFIX}>After the key (b1.)</option>
                        </select>
                      </div>
                    </div>
                    <p className="field-hint">
                      Defaults to a dot before the key. Change either if that clashes with
                      something else in your workflow — the name-only code becomes{' '}
                      <code>{nameCodeExample}</code> instead of <code>.b1</code>.
                    </p>
                  </div>
                )}
                <label className="check">
                  <input
                    type="radio"
                    name="code-style"
                    checked={options.codeStyle === CODE_STYLES.COLUMNS}
                    onChange={() => set('codeStyle', CODE_STYLES.COLUMNS)}
                  />
                  <span className="check-text">
                    Multi-column: one code per player
                    <span className="check-sub">
                      <code>b1</code> carries caption, name, position, team and number as columns
                      1&ndash;5. Point each field in your Photo Mechanic template at a column:{' '}
                      <code>{'={b1}#1='}</code>, <code>{'={b1}#2='}</code>, and so on.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <span className="field-label">Extra codes by initials</span>
              <div className="stack-sm">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.initialsCodes}
                    onChange={(e) => set('initialsCodes', e.target.checked)}
                  />
                  <span className="check-text">
                    Add a second set keyed by initials
                    <span className="check-sub">
                      Appended at the end of the file, so <code>b{initials}</code> types the same
                      caption as the player&rsquo;s shirt-number code — useful when you know the
                      name but not the number.
                    </span>
                  </span>
                </label>
                {options.initialsCodes && (
                  <div style={{ marginLeft: 25 }}>
                    <label className="field-label" htmlFor="fx-initials-delimiter">
                      Team key on these codes
                    </label>
                    <select
                      id="fx-initials-delimiter"
                      className="select"
                      value={options.initialsDelimiterMode}
                      onChange={(e) =>
                        set(
                          'initialsDelimiterMode',
                          e.target.value as CodeOptions['initialsDelimiterMode']
                        )
                      }
                    >
                      <option value={INITIALS_DELIMITER_MODES.WITH}>
                        Include it (b{initials})
                      </option>
                      <option value={INITIALS_DELIMITER_MODES.WITHOUT}>
                        Leave it out ({initials})
                      </option>
                      <option value={INITIALS_DELIMITER_MODES.BOTH}>
                        Both (b{initials} and {initials})
                      </option>
                    </select>
                    <p className="field-hint">
                      Initials collide far more easily than shirt numbers — two players sharing
                      them, or a code already used elsewhere in the file. Anything doubled up is
                      flagged above the file on the right.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <span className="field-label">Staff codes</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={options.staffCodes}
                  onChange={(e) => set('staffCodes', e.target.checked)}
                />
                <span className="check-text">
                  Add a code for each first-team staff member
                  <span className="check-sub">
                    Listed under the manager line, keyed by initials after it — <code>bmas</code>{' '}
                    types &ldquo;Arsenal assistant manager Albert Stuivenberg&rdquo;. Covers
                    coaching, medical, kit and team managers.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid-2">
              <div>
                <label className="field-label" htmlFor="fx-competition">
                  Competition
                </label>
                <input
                  id="fx-competition"
                  type="text"
                  className="input"
                  value={options.competition}
                  placeholder="SSE Airtricity League Premier Division"
                  onChange={(e) => set('competition', e.target.value)}
                />
                <p className="field-hint">
                  Added to the file as the code <code>co</code>.
                </p>
              </div>
              <div>
                <label className="field-label" htmlFor="fx-referee">
                  Referee
                </label>
                <input
                  id="fx-referee"
                  type="text"
                  className="input"
                  value={options.referee}
                  placeholder="Rob Harvey"
                  onChange={(e) => set('referee', e.target.value)}
                />
                <p className="field-hint">
                  Added as <code>Ref</code> and <code>ref</code>.
                </p>
              </div>
              <div>
                <label className="field-label" htmlFor="fx-date">
                  Fixture date
                </label>
                <input
                  id="fx-date"
                  type="date"
                  className="input"
                  value={options.selectedDate}
                  onChange={(e) => set('selectedDate', e.target.value)}
                />
                <p className="field-hint">Used to name the downloaded file.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="fx-sort">
                  Order players by
                </label>
                <select
                  id="fx-sort"
                  className="select"
                  value={options.sortOption}
                  onChange={(e) => set('sortOption', e.target.value)}
                >
                  <option value="position">Position on the team sheet</option>
                  <option value="number">Shirt number</option>
                </select>
              </div>
            </div>

            <div>
              <span className="field-label">Squad and naming</span>
              <div className="stack-sm">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.shouldShorten}
                    onChange={(e) => set('shouldShorten', e.target.checked)}
                  />
                  <span className="check-text">
                    Shorten “Football Club” to “FC”
                    <span className="check-sub">
                      Keeps captions inside wire-service length limits.
                    </span>
                  </span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.includeNoNumberPlayers}
                    onChange={(e) => set('includeNoNumberPlayers', e.target.checked)}
                  />
                  <span className="check-text">
                    Include players with no shirt number
                    <span className="check-sub">
                      Trialists and new signings, coded with a dash instead of a number.
                    </span>
                  </span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.shouldChangeGoalkeeperStyle}
                    onChange={(e) => set('shouldChangeGoalkeeperStyle', e.target.checked)}
                  />
                  <span className="check-text">
                    Caption goalkeepers differently
                    <span className="check-sub">
                      Goalkeepers become “{sampleTeam}&rsquo;s goalkeeper {player.name}”.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="fx-extra">
                Your own codes
              </label>
              <textarea
                id="fx-extra"
                className="textarea"
                value={options.additionalCodes}
                placeholder={'iaa\tin action against'}
                onChange={(e) => set('additionalCodes', e.target.value)}
                onKeyDown={(e) => {
                  // Tab belongs in the file, not in the focus order, while you
                  // are writing code/description pairs — so Escape is the way
                  // back out to the rest of the form.
                  if (e.key === 'Escape') {
                    (e.target as HTMLTextAreaElement).blur();
                    return;
                  }
                  if (e.key !== 'Tab' || e.shiftKey) {
                    return;
                  }
                  e.preventDefault();
                  const target = e.target as HTMLTextAreaElement;
                  const { selectionStart: start, selectionEnd: end } = target;
                  set(
                    'additionalCodes',
                    options.additionalCodes.slice(0, start) +
                      '\t' +
                      options.additionalCodes.slice(end)
                  );
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 1;
                  });
                }}
              />
              <p className="field-hint">
                One per line, with a tab between the code and what it types. Press Tab inside
                this box to insert a tab, and Escape to leave the box.
              </p>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={save}>
              Save for next time
            </button>
            {saved && (
              <button type="button" className="btn btn-ghost" onClick={clear}>
                Clear saved settings
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
