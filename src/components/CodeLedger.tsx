import React, { useEffect, useMemo, useState } from 'react';
import CopyButton from './CopyButton';
import CacheStatusBadge from './CacheStatusBadge';
import { downloadTextFile } from '../utils/helpers';
import { NameCodePosition } from '../constants/config';

type LineKind = 'blank' | 'entry' | 'raw';
type Side = 'home' | 'away' | null;

interface Line {
  kind: LineKind;
  /** The line as the generator wrote it — the key its removal or edit is remembered under. */
  source: string;
  code: string;
  /** True when the code has been edited by hand. */
  edited: boolean;
  text: string;
  side: Side;
  /** True when another line in the file claims the same code. */
  duplicate: boolean;
}

/**
 * Split a code replacement file into its parts.
 *
 * The file format is `code<TAB>description`, one per line, with blank lines
 * separating blocks. Which team a line belongs to is carried by its key
 * (after the name-only mark is stripped off, if present), so that is how
 * each line gets its kit colour. Keys can be one or two characters, so this
 * checks the longer of the two team keys first — if one key happens to be a
 * prefix of the other, the more specific match wins.
 *
 * Hand edits are applied on the way through: a line overridden with `null`
 * is dropped, one overridden with a string gets that as its code.
 */
const parseLines = (
  code: string,
  overrides: Map<string, string | null>,
  homePrefix: string,
  awayPrefix: string,
  namePrefix: string,
  namePosition: NameCodePosition
): Line[] => {
  const sideOf = (raw: string): Side => {
    let stripped = raw;
    if (namePrefix) {
      if (namePosition === 'suffix' && raw.endsWith(namePrefix)) {
        stripped = raw.slice(0, raw.length - namePrefix.length);
      } else if (namePosition === 'prefix' && raw.startsWith(namePrefix)) {
        stripped = raw.slice(namePrefix.length);
      }
    }
    if (!stripped) {
      return null;
    }
    const bySize = [
      { side: 'home' as const, prefix: homePrefix },
      { side: 'away' as const, prefix: awayPrefix },
    ]
      .filter((entry) => entry.prefix)
      .sort((a, b) => b.prefix.length - a.prefix.length);

    return bySize.find((entry) => stripped.startsWith(entry.prefix))?.side ?? null;
  };

  const plain = { edited: false, side: null, duplicate: false };
  const lines: Line[] = code
    .split('\n')
    .filter((line) => overrides.get(line) !== null)
    .map((line) => {
      if (!line.trim()) {
        return { ...plain, kind: 'blank' as const, source: line, code: '', text: '' };
      }
      const tab = line.indexOf('\t');
      if (tab === -1) {
        return { ...plain, kind: 'raw' as const, source: line, code: '', text: line };
      }
      const override = overrides.get(line);
      const codeCell = override ?? line.slice(0, tab);
      return {
        kind: 'entry' as const,
        source: line,
        code: codeCell,
        edited: override !== undefined,
        text: line.slice(tab + 1),
        side: sideOf(codeCell),
        duplicate: false,
      };
    });

  // Photo Mechanic keeps one replacement per code, so a code claimed twice
  // means one of the two silently never fires. Codes are compared as written:
  // the file ships `Ref` and `ref` as deliberately separate entries.
  const counts = new Map<string, number>();
  lines.forEach((line) => {
    if (line.kind === 'entry') {
      counts.set(line.code, (counts.get(line.code) ?? 0) + 1);
    }
  });

  return lines.map((line) =>
    line.kind === 'entry' && (counts.get(line.code) ?? 0) > 1
      ? { ...line, duplicate: true }
      : line
  );
};

/** A parsed line back as a line of the file. */
const lineToText = (line: Line): string =>
  line.kind === 'entry' ? `${line.code}\t${line.text}` : line.text;

/** Caption-column widths for the empty file, in px. A 0 marks a blank line. */
const GHOST_ROWS = [260, 190, 300, 0, 215, 275, 165, 240, 0, 265, 200, 285, 175, 250];

interface CodeLedgerProps {
  code: string;
  homePrefix: string;
  awayPrefix: string;
  /** Mark stripped off a code before reading its team letter, e.g. the "." in ".b1". */
  namePrefix?: string;
  /** Whether that mark sits before the key (".b1") or after it ("b1."). */
  namePosition?: NameCodePosition;
  /** Filename used for the download, without extension. */
  filename: string;
  /** True while a squad is still being fetched. */
  busy?: boolean;
  /** Re-animates the file when this changes — i.e. when a squad lands. */
  generation: string;
  emptyTitle: string;
  emptyText: string;
  /** Shown in place of the empty state while `busy` is true. */
  busyTitle?: string;
  busyText?: string;
}

/**
 * The file being produced, shown while it is being produced.
 *
 * Codes sit in their own column with the tab stop drawn as a rule, so what is
 * on screen has the same shape as the text file that lands in Photo Mechanic.
 */
export default function CodeLedger({
  code,
  homePrefix,
  awayPrefix,
  namePrefix: rawNamePrefix = '.',
  namePosition = 'prefix',
  filename,
  busy = false,
  generation,
  emptyTitle,
  emptyText,
  busyTitle = 'Loading squad',
  busyText = 'Pulling the squad list from Transfermarkt.',
}: CodeLedgerProps): React.ReactElement {
  // Matches the generator's own fallback for a cleared mark field.
  const namePrefix = rawNamePrefix || '.';

  /**
   * Hand changes to the file: `null` for a line taken out, a string for a
   * line whose code was rewritten. Keyed by the line as the generator wrote
   * it rather than its position — flipping an option regenerates the file and
   * shifts everything down, but "am<TAB>Arsenal FC manager Mikel Arteta" is
   * still the line that was changed. A new squad is a new file, so the slate
   * is wiped then.
   */
  const [overrides, setOverrides] = useState<Map<string, string | null>>(() => new Map());
  useEffect(() => {
    setOverrides(new Map());
  }, [generation]);

  const setOverride = (source: string, value: string | null | undefined) =>
    setOverrides((previous) => {
      const next = new Map(previous);
      if (value === undefined) {
        next.delete(source);
      } else {
        next.set(source, value);
      }
      return next;
    });

  /** The line whose code is open for editing, by its source line. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (line: Line) => {
    setEditing(line.source);
    setDraft(line.code);
  };

  /**
   * Save the edited code. Tabs and line breaks would break the file's shape,
   * so all whitespace goes. Clearing the box, or typing the original code
   * back in, drops the edit rather than leaving an empty or no-op override.
   */
  const commitEdit = () => {
    if (editing === null) {
      return;
    }
    const value = draft.replace(/\s+/g, '');
    const original = editing.slice(0, editing.indexOf('\t'));
    setOverride(editing, value && value !== original ? value : undefined);
    setEditing(null);
  };

  const lines = useMemo(
    () => parseLines(code, overrides, homePrefix, awayPrefix, namePrefix, namePosition),
    [code, overrides, homePrefix, awayPrefix, namePrefix, namePosition]
  );

  // What actually ships: on screen, on the clipboard and in the download.
  const visibleCode = useMemo(
    () => (overrides.size === 0 ? code : lines.map(lineToText).join('\n')),
    [code, overrides, lines]
  );

  // Only changes that still match a line in the current file count — one
  // whose line has since changed (a renamed option, say) has nothing to apply to.
  const changedCount = useMemo(
    () => code.split('\n').filter((line) => overrides.has(line)).length,
    [code, overrides]
  );

  const codeCount = useMemo(
    () => lines.filter((line) => line.kind === 'entry').length,
    [lines]
  );

  // Listed once each, in the order they first appear, so the warning names the
  // codes rather than repeating one for every line that claims it.
  const duplicateCodes = useMemo(
    () => [...new Set(lines.filter((line) => line.duplicate).map((line) => line.code))],
    [lines]
  );

  // Judged on the generated file, so removing every line leaves the file
  // (and its Reset button) on screen rather than flipping to the empty state.
  const hasCode = code.trim().length > 0;

  return (
    <section className="panel ledger" aria-label="Code replacements">
      <div className="panel-head">
        <h2 className="panel-title">Code replacements</h2>
        <div className="panel-head-meta">
          <CacheStatusBadge />
          {hasCode && changedCount > 0 && (
            <button
              type="button"
              className="ledger-restore"
              onClick={() => setOverrides(new Map())}
            >
              {changedCount} {changedCount === 1 ? 'change' : 'changes'} &middot; Reset
            </button>
          )}
          {hasCode && (
            <span className="ledger-count">
              {codeCount} {codeCount === 1 ? 'code' : 'codes'}
            </span>
          )}
        </div>
      </div>

      {duplicateCodes.length > 0 && (
        <div className="notice notice-signal ledger-notice" role="status">
          <div>
            <strong>
              {duplicateCodes.length === 1
                ? 'One code is used twice'
                : `${duplicateCodes.length} codes are used more than once`}
            </strong>{' '}
            — Photo Mechanic keeps only one replacement per code, so the others never fire.
            Marked below:{' '}
            {duplicateCodes.map((duplicate, index) => (
              <React.Fragment key={duplicate}>
                {index > 0 && ', '}
                <code>{duplicate}</code>
              </React.Fragment>
            ))}
            .
          </div>
        </div>
      )}

      <div className="ledger-body">
        {hasCode ? (
          <div key={generation} className="ledger-group">
            {lines.map((line, index) => (
              <div
                // A line in a text file is identified by its position in the
                // file, so the index is the correct identity here.
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className={[
                  'ledger-line',
                  line.kind === 'blank' ? 'ledger-line-blank' : '',
                  line.side === null && line.kind === 'entry' ? 'ledger-line-meta' : '',
                  line.duplicate ? 'ledger-line-duplicate' : '',
                  line.edited ? 'ledger-line-edited' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  line.side
                    ? ({
                        ['--kit' as string]:
                          line.side === 'home' ? 'var(--home)' : 'var(--away)',
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="ledger-line-kit" aria-hidden="true" />
                {line.kind === 'entry' && editing === line.source ? (
                  <input
                    className="ledger-line-code ledger-line-code-input"
                    aria-label={`New code for ${line.text}`}
                    value={draft}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitEdit();
                      } else if (e.key === 'Escape') {
                        setEditing(null);
                      }
                    }}
                  />
                ) : line.kind === 'entry' ? (
                  <button
                    type="button"
                    className="ledger-line-code ledger-line-code-button"
                    aria-label={`Edit code ${line.code}`}
                    title="Click to edit this code"
                    onClick={() => startEdit(line)}
                  >
                    {line.code}
                  </button>
                ) : (
                  <span className="ledger-line-code">{line.code}</span>
                )}
                <span className="ledger-line-text">{line.text}</span>
                {line.kind === 'entry' ? (
                  <button
                    type="button"
                    className="ledger-line-remove"
                    aria-label={`Remove ${line.code} from the file`}
                    title="Remove this line"
                    onClick={() => setOverride(line.source, null)}
                  >
                    &times;
                  </button>
                ) : (
                  <span className="ledger-line-remove-slot" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="ledger-empty">
            {/* The file's own shape, drawn empty — a code column, a tab stop,
                and a caption column waiting to be filled. */}
            <div className="ledger-ghost" aria-hidden="true">
              {GHOST_ROWS.map((width, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div className="ledger-line" key={index}>
                  <span className="ledger-line-kit" />
                  <span className="ledger-line-code">
                    <i className="ledger-ghost-bar" style={{ width: index % 4 === 3 ? 0 : 22 }} />
                  </span>
                  <span className="ledger-line-text">
                    <i className="ledger-ghost-bar" style={{ width }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="ledger-empty-message">
              <p className="ledger-empty-title">{busy ? busyTitle : emptyTitle}</p>
              <p className="ledger-empty-text">{busy ? busyText : emptyText}</p>
            </div>
          </div>
        )}
      </div>

      {hasCode && (
        <div className="panel-foot">
          <CopyButton text={visibleCode} label="Copy file" />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadTextFile(visibleCode, `${filename}.txt`)}
          >
            Download .txt
          </button>
          <span className="field-hint" style={{ marginTop: 0, marginLeft: 'auto' }}>
            Photo Mechanic: Edit &rsaquo; Settings &rsaquo; Code Replacements
          </span>
        </div>
      )}
    </section>
  );
}
