package com.groovy.collector

/**
 * Decides which buffered raw events belong to a "party session".
 *
 * Rules (from product spec):
 *   - Within a single client_session_id, group events in chronological order.
 *   - A "party window" begins when 3 of the last 4 transitions are skip_to_next.
 *   - It ends when 5+ minutes pass without a new event in that session, or
 *     when 4 consecutive transitions are natural_transition.
 *   - Trim the first 2 and last 2 *track changes* of each party window
 *     before uploading (warm-up/cool-down).
 */
object PartyModeClassifier {

    private const val WINDOW = 4
    private const val MIN_SKIPS_IN_WINDOW = 3
    private const val COOLDOWN_MS = 5 * 60 * 1000L
    private const val MAX_NATURAL_RUN = 4
    private const val TRIM_HEAD = 2
    private const val TRIM_TAIL = 2

    data class PartySession(
        val clientSessionId: String,
        val startedAt: Long,
        val endedAt: Long,
        val trackCount: Int,
        val qualifyingSkipCount: Int,
    )

    data class Classified(
        val sessions: List<PartySession>,
        /** rows to upload (already trimmed) */
        val uploadEvents: List<RawEventRow>,
        /** ids that can be safely deleted from the buffer (uploaded OR discarded as non-party) */
        val handledIds: List<Long>,
    )

    fun classify(rows: List<RawEventRow>): Classified {
        if (rows.isEmpty()) return Classified(emptyList(), emptyList(), emptyList())

        val grouped = rows.groupBy { it.clientSessionId }
        val sessions = mutableListOf<PartySession>()
        val uploadEvents = mutableListOf<RawEventRow>()
        val handledIds = mutableListOf<Long>()

        for ((sessionId, events) in grouped) {
            val sorted = events.sortedBy { it.occurredAt }
            val windows = detectPartyWindows(sorted)

            // Everything in this session is "handled" — either we upload it
            // (party window) or discard it (non-party).
            handledIds += sorted.map { it.id }

            for (window in windows) {
                if (window.size < TRIM_HEAD + TRIM_TAIL + 1) continue
                val trimmed = window.drop(TRIM_HEAD).dropLast(TRIM_TAIL)
                if (trimmed.isEmpty()) continue

                val skipCount = trimmed.count { it.eventType == "skip_to_next" }
                sessions += PartySession(
                    clientSessionId = sessionId,
                    startedAt = trimmed.first().occurredAt,
                    endedAt = trimmed.last().occurredAt,
                    trackCount = trimmed.count { it.eventType != "seek_forward" },
                    qualifyingSkipCount = skipCount,
                )
                uploadEvents += trimmed
            }
        }

        return Classified(sessions, uploadEvents, handledIds)
    }

    /**
     * Walk through events in time order. Maintain a sliding window of the
     * last WINDOW transitions; when MIN_SKIPS_IN_WINDOW of them are
     * skip_to_next, we're in a party window. Extend the window forward
     * until the cool-down conditions fire.
     *
     * Returns a list of contiguous event slices that count as party windows.
     */
    private fun detectPartyWindows(events: List<RawEventRow>): List<List<RawEventRow>> {
        val transitions = events.withIndex()
            .filter { it.value.eventType != "seek_forward" }
            .toList()
        if (transitions.size < WINDOW) return emptyList()

        val partyWindows = mutableListOf<List<RawEventRow>>()
        var inWindow = false
        var windowStartIndex = 0
        var naturalRun = 0

        fun lastWindowSkipCount(uptoIndex: Int): Int {
            val from = maxOf(0, uptoIndex - WINDOW + 1)
            return (from..uptoIndex).count { transitions[it].value.eventType == "skip_to_next" }
        }

        for (i in transitions.indices) {
            val skipsInWindow = lastWindowSkipCount(i)
            val transition = transitions[i].value

            if (!inWindow) {
                if (skipsInWindow >= MIN_SKIPS_IN_WINDOW) {
                    inWindow = true
                    // Backdate: include the events of the qualifying window.
                    windowStartIndex = maxOf(0, i - WINDOW + 1)
                    naturalRun = 0
                }
            } else {
                if (transition.eventType == "natural_transition") naturalRun++ else naturalRun = 0
                val gapSinceLast = if (i == 0) 0L
                    else transition.occurredAt - transitions[i - 1].value.occurredAt
                val cooldown = gapSinceLast > COOLDOWN_MS
                val tooManyNaturals = naturalRun >= MAX_NATURAL_RUN
                if (cooldown || tooManyNaturals) {
                    val endIndex = i - if (cooldown) 1 else naturalRun
                    val slice = sliceFromTransitionRange(events, transitions, windowStartIndex, endIndex)
                    if (slice.isNotEmpty()) partyWindows += slice
                    inWindow = false
                }
            }
        }
        if (inWindow) {
            val slice = sliceFromTransitionRange(events, transitions, windowStartIndex, transitions.size - 1)
            if (slice.isNotEmpty()) partyWindows += slice
        }
        return partyWindows
    }

    private fun sliceFromTransitionRange(
        events: List<RawEventRow>,
        transitions: List<IndexedValue<RawEventRow>>,
        startIdx: Int,
        endIdx: Int,
    ): List<RawEventRow> {
        if (startIdx > endIdx || startIdx !in transitions.indices) return emptyList()
        val originalFrom = transitions[startIdx].index
        val originalTo = transitions[endIdx.coerceAtMost(transitions.lastIndex)].index
        return events.subList(originalFrom, originalTo + 1)
    }
}
