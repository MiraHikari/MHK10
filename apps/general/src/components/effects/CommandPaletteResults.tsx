import { useMemo, type RefObject } from 'react';
import { Swap } from '@/components/motion/Swap';
import {
  type Command,
  type CommandType,
  typeColor,
  typeBadge,
  parseQueryPrefix,
} from '@/lib/command-registry';
import { commandIcon } from '@/components/effects/palette/command-icons';
import { highlightSegments } from '@/lib/command-match';

interface CommandGroupView {
  readonly label: string;
  readonly commands: readonly Command[];
}

interface CommandPaletteResultsProps {
  readonly id?: string;
  readonly groups: readonly CommandGroupView[];
  readonly emptyMessage: string;
  readonly query: string;
  readonly selectedIndex: number;
  readonly listRef: RefObject<HTMLUListElement | null>;
  readonly selectedRef: RefObject<HTMLLIElement | null>;
  readonly onSelectIndex: (index: number) => void;
  readonly onExecute: (command: Command) => void;
}

/** 去掉 :前缀,只按实际搜索词高亮标签。 */
function renderHighlightedLabel(label: string, query: string) {
  const parsed = parseQueryPrefix(query);
  const term = parsed.prefix ? parsed.term : query;
  const segments = highlightSegments(label, term);
  if (segments.length === 1 && !segments[0].matched) return label;
  return segments.map((segment, index) =>
    segment.matched ? (
      <span key={index} className="text-accent-ink">
        {segment.text}
      </span>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

function CommandTypeBadge({ type }: { readonly type: CommandType }) {
  return (
    <span
      className={`shrink-0 text-micro font-mono border border-white/15 px-1.5 py-0.5 ${typeColor(type)}`}
    >
      {typeBadge(type)}
    </span>
  );
}

export default function CommandPaletteResults({
  id,
  groups,
  emptyMessage,
  query,
  selectedIndex,
  listRef,
  selectedRef,
  onSelectIndex,
  onExecute,
}: CommandPaletteResultsProps) {
  const isEmpty = groups.length === 0 || groups.every((group) => group.commands.length === 0);
  const swapKey = useMemo(() => {
    if (isEmpty) return 'empty';
    return groups.flatMap((group) => group.commands.map((command) => command.id)).join('|');
  }, [groups, isEmpty]);

  let nextIndex = 0;

  return (
    <Swap itemKey={swapKey} layout={false}>
      {isEmpty ? (
        <div className="px-4 py-8 text-center text-xs text-white/25 font-mono">{emptyMessage}</div>
      ) : (
        <ul id={id} ref={listRef} role="listbox">
          {groups.map((group) => {
            const groupStart = nextIndex;
            nextIndex += group.commands.length;

            return (
              <li key={group.label}>
                {groups.length > 1 && (
                  <div className="px-4 pt-3 pb-1 text-micro font-mono uppercase tracking-eyebrow text-white/20">
                    {group.label}
                  </div>
                )}
                <ul>
                  {group.commands.map((command, index) => {
                    const flatIndex = groupStart + index;
                    const isSelected = flatIndex === selectedIndex;
                    const Icon = commandIcon(command);

                    return (
                      <li key={command.id} ref={isSelected ? selectedRef : undefined}>
                        <button
                          id={`command-option-${command.id}`}
                          type="button"
                          data-command-id={command.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={(event) => {
                            event.preventDefault();
                            onExecute(command);
                          }}
                          onMouseEnter={() => onSelectIndex(flatIndex)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 cursor-pointer border-l-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-accent-base/15 border-l-accent-base text-white'
                              : 'border-l-transparent text-white/70 hover:bg-white/5'
                          }`}
                        >
                          <span className="min-w-0 flex items-center gap-2.5">
                            {Icon && <Icon className="w-3.5 h-3.5 text-white/35 shrink-0" />}
                            <span className="min-w-0">
                              <span className="block text-sm font-mono truncate">
                                {renderHighlightedLabel(command.label, query)}
                              </span>
                              <span className="mt-0.5 block truncate text-micro font-mono text-white/35">
                                {command.hint}
                              </span>
                            </span>
                          </span>
                          <CommandTypeBadge type={command.type} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Swap>
  );
}
