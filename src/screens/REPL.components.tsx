import figures from 'figures'
import React, { type RefObject, useEffect, useState } from 'react'
import { c as _c } from 'react/compiler-runtime'
import type { JumpHandle } from '../components/VirtualMessageList.js'
import { useSearchInput } from '../hooks/useSearchInput.js'
import { Box, Text, useTerminalFocus, useTerminalTitle } from '../ink.js'
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js'
import {
  TITLE_ANIMATION_FRAMES,
  TITLE_ANIMATION_INTERVAL_MS,
  TITLE_STATIC_PREFIX,
} from './REPL.utils.js'

/**
 * Small component to display transcript mode footer with dynamic keybinding.
 * Must be rendered inside KeybindingSetup to access keybinding context.
 */
export function TranscriptModeFooter(t0) {
  const $ = _c(9)
  const { showAllInTranscript, virtualScroll, searchBadge, suppressShowAll: t1, status } = t0
  const suppressShowAll = t1 === undefined ? false : t1
  const toggleShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o')
  const showAllShortcut = useShortcutDisplay('transcript:toggleShowAll', 'Transcript', 'ctrl+e')
  const t2 = searchBadge
    ? ' \xB7 n/N to navigate'
    : virtualScroll
      ? ` · ${figures.arrowUp}${figures.arrowDown} scroll · home/end top/bottom`
      : suppressShowAll
        ? ''
        : ` · ${showAllShortcut} to ${showAllInTranscript ? 'collapse' : 'show all'}`
  let t3
  if ($[0] !== t2 || $[1] !== toggleShortcut) {
    t3 = (
      <Text dimColor={true}>
        Showing detailed transcript · {toggleShortcut} to toggle{t2}
      </Text>
    )
    $[0] = t2
    $[1] = toggleShortcut
    $[2] = t3
  } else {
    t3 = $[2]
  }
  let t4
  if ($[3] !== searchBadge || $[4] !== status) {
    t4 = status ? (
      <>
        <Box flexGrow={1} />
        <Text>{status} </Text>
      </>
    ) : searchBadge ? (
      <>
        <Box flexGrow={1} />
        <Text dimColor={true}>
          {searchBadge.current}/{searchBadge.count}
          {'  '}
        </Text>
      </>
    ) : null
    $[3] = searchBadge
    $[4] = status
    $[5] = t4
  } else {
    t4 = $[5]
  }
  let t5
  if ($[6] !== t3 || $[7] !== t4) {
    t5 = (
      <Box
        noSelect={true}
        alignItems="center"
        alignSelf="center"
        borderTopDimColor={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderStyle="single"
        marginTop={1}
        paddingLeft={2}
        width="100%"
      >
        {t3}
        {t4}
      </Box>
    )
    $[6] = t3
    $[7] = t4
    $[8] = t5
  } else {
    t5 = $[8]
  }
  return t5
}

/** less-style / bar. 1-row, same border-top styling as TranscriptModeFooter
 *  so swapping them in the bottom slot doesn't shift ScrollBox height.
 *  useSearchInput handles readline editing; we report query changes and
 *  render the counter. Incremental — re-search + highlight per keystroke. */
export function TranscriptSearchBar({
  jumpRef,
  count,
  current,
  onClose,
  onCancel,
  setHighlight,
  initialQuery,
}: {
  jumpRef: RefObject<JumpHandle | null>
  count: number
  current: number
  /** Enter — commit. Query persists for n/N. */
  onClose: (lastQuery: string) => void
  /** Esc/ctrl+c/ctrl+g — undo to pre-/ state. */
  onCancel: () => void
  setHighlight: (query: string) => void
  // Seed with the previous query (less: / shows last pattern). Mount-fire
  // of the effect re-scans with the same query — idempotent (same matches,
  // nearest-ptr, same highlights). User can edit or clear.
  initialQuery: string
}): React.ReactNode {
  const { query, cursorOffset } = useSearchInput({
    isActive: true,
    initialQuery,
    onExit: () => onClose(query),
    onCancel,
  })
  // Index warm-up runs before the query effect so it measures the real
  // cost — otherwise setSearchQuery fills the cache first and warm
  // reports ~0ms while the user felt the actual lag.
  // First / in a transcript session pays the extractSearchText cost.
  // Subsequent / return 0 immediately (indexWarmed ref in VML).
  // Transcript is frozen at ctrl+o so the cache stays valid.
  // Initial 'building' so warmDone is false on mount — the [query] effect
  // waits for the warm effect's first resolve instead of racing it. With
  // null initial, warmDone would be true on mount → [query] fires →
  // setSearchQuery fills cache → warm reports ~0ms while the user felt
  // the real lag.
  const [indexStatus, setIndexStatus] = React.useState<
    | 'building'
    | {
        ms: number
      }
    | null
  >('building')
  React.useEffect(() => {
    let alive = true
    const warm = jumpRef.current?.warmSearchIndex
    if (!warm) {
      setIndexStatus(null) // VML not mounted yet — rare, skip indicator
      return
    }
    setIndexStatus('building')
    warm().then((ms) => {
      if (!alive) return
      // <20ms = imperceptible. No point showing "indexed in 3ms".
      if (ms < 20) {
        setIndexStatus(null)
      } else {
        setIndexStatus({
          ms,
        })
        setTimeout(() => alive && setIndexStatus(null), 2000)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount-only: bar opens once per /
  // Gate the query effect on warm completion. setHighlight stays instant
  // (screen-space overlay, no indexing). setSearchQuery (the scan) waits.
  const warmDone = indexStatus !== 'building'
  useEffect(() => {
    if (!warmDone) return
    jumpRef.current?.setSearchQuery(query)
    setHighlight(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, warmDone])
  const off = cursorOffset
  const cursorChar = off < query.length ? query[off] : ' '
  return (
    <Box
      borderTopDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      marginTop={1}
      paddingLeft={2}
      width="100%"
      // applySearchHighlight scans the whole screen buffer. The query
      // text rendered here IS on screen — /foo matches its own 'foo' in
      // the bar. With no content matches that's the ONLY visible match →
      // gets CURRENT → underlined. noSelect makes searchHighlight.ts:76
      // skip these cells (same exclusion as gutters). You can't text-
      // select the bar either; it's transient chrome, fine.
      noSelect
    >
      <Text>/</Text>
      <Text>{query.slice(0, off)}</Text>
      <Text inverse>{cursorChar}</Text>
      {off < query.length && <Text>{query.slice(off + 1)}</Text>}
      <Box flexGrow={1} />
      {indexStatus === 'building' ? (
        <Text dimColor>indexing… </Text>
      ) : indexStatus ? (
        <Text dimColor>indexed in {indexStatus.ms}ms </Text>
      ) : count === 0 && query ? (
        <Text color="error">no matches </Text>
      ) : count > 0 ? (
        // Engine-counted (indexOf on extractSearchText). May drift from
        // render-count for ghost/phantom messages — badge is a rough
        // location hint. scanElement gives exact per-message positions
        // but counting ALL would cost ~1-3ms × matched-messages.
        <Text dimColor>
          {current}/{count}
          {'  '}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Sets the terminal tab title, with an animated prefix glyph while a query
 * is running. Isolated from REPL so the 960ms animation tick re-renders only
 * this leaf component (which returns null — pure side-effect) instead of the
 * entire REPL tree. Before extraction, the tick was ~1 REPL render/sec for
 * the duration of every turn, dragging PromptInput and friends along.
 */
export function AnimatedTerminalTitle(t0) {
  const $ = _c(6)
  const { isAnimating, title, disabled, noPrefix } = t0
  const terminalFocused = useTerminalFocus()
  const [frame, setFrame] = useState(0)
  let t1
  let t2
  if ($[0] !== disabled || $[1] !== isAnimating || $[2] !== noPrefix || $[3] !== terminalFocused) {
    t1 = () => {
      if (disabled || noPrefix || !isAnimating || !terminalFocused) {
        return
      }
      const interval = setInterval(_temp2, TITLE_ANIMATION_INTERVAL_MS, setFrame)
      return () => clearInterval(interval)
    }
    t2 = [disabled, noPrefix, isAnimating, terminalFocused]
    $[0] = disabled
    $[1] = isAnimating
    $[2] = noPrefix
    $[3] = terminalFocused
    $[4] = t1
    $[5] = t2
  } else {
    t1 = $[4]
    t2 = $[5]
  }
  useEffect(t1, t2)
  const prefix = isAnimating
    ? (TITLE_ANIMATION_FRAMES[frame] ?? TITLE_STATIC_PREFIX)
    : TITLE_STATIC_PREFIX
  useTerminalTitle(disabled ? null : noPrefix ? title : `${prefix} ${title}`)
  return null
}
function _temp2(setFrame_0) {
  return setFrame_0(_temp)
}
function _temp(f) {
  return (f + 1) % TITLE_ANIMATION_FRAMES.length
}
