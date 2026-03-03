/**
 * Participant Selector — Dynamic debate participant selection based on ticket context
 *
 * Selects debate participants based on:
 * 1. Ticket category (BUG/FEATURE/POLICY) → base participant set
 * 2. Keyword matching vs persona domainExpertise → additional participants
 *
 * Rules:
 * - PM (moderator) is always included
 * - Minimum 2 participants, maximum 5 participants
 * - figma-to-jira and auto-review keep fixed participants (clear context)
 */

import { AgentPersona } from '@rtb-ai-hub/shared';
import { TicketCategory } from '../classifier/ticket-classifier';
import { getAllPersonas } from './persona-registry';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('participant-selector');

/** Base participant sets per ticket category */
const CATEGORY_PARTICIPANTS: Record<TicketCategory, AgentPersona[]> = {
  [TicketCategory.BUG]: [
    AgentPersona.PM,
    AgentPersona.BACKEND_DEVELOPER,
    AgentPersona.QA,
  ],
  [TicketCategory.FEATURE]: [
    AgentPersona.PM,
    AgentPersona.SYSTEM_PLANNER,
    AgentPersona.BACKEND_DEVELOPER,
    AgentPersona.QA,
  ],
  [TicketCategory.POLICY]: [
    AgentPersona.PM,
    AgentPersona.SYSTEM_PLANNER,
    AgentPersona.DEVOPS,
  ],
};

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 5;

export type ParticipantSelectionInput = {
  category: TicketCategory;
  summary: string;
  description?: string;
};

export type ParticipantSelectionResult = {
  participants: AgentPersona[];
  moderator: AgentPersona;
  reason: string;
};

/**
 * Select debate participants dynamically based on ticket context.
 */
export function selectParticipants(input: ParticipantSelectionInput): ParticipantSelectionResult {
  const { category, summary, description } = input;
  const baseParticipants = [...CATEGORY_PARTICIPANTS[category]];

  // Keyword matching to add domain-relevant participants
  const text = `${summary} ${description || ''}`.toLowerCase();
  const allPersonas = getAllPersonas();

  const additionalCandidates: Array<{ persona: AgentPersona; score: number }> = [];

  for (const persona of allPersonas) {
    if (baseParticipants.includes(persona.persona)) continue;

    // Score based on keyword matches in domainExpertise
    let score = 0;
    for (const expertise of persona.domainExpertise) {
      if (text.includes(expertise.toLowerCase())) {
        score += 1;
      }
    }
    // Also check vocabulary
    for (const word of persona.vocabulary) {
      if (text.includes(word.toLowerCase())) {
        score += 0.5;
      }
    }

    if (score > 0) {
      additionalCandidates.push({ persona: persona.persona, score });
    }
  }

  // Sort by score descending and add top candidates up to MAX
  additionalCandidates.sort((a, b) => b.score - a.score);

  const selected = [...baseParticipants];
  for (const candidate of additionalCandidates) {
    if (selected.length >= MAX_PARTICIPANTS) break;
    selected.push(candidate.persona);
  }

  // Ensure PM is moderator and always included
  if (!selected.includes(AgentPersona.PM)) {
    selected.unshift(AgentPersona.PM);
  }

  // Enforce minimum (shouldn't happen with base sets, but safety)
  while (selected.length < MIN_PARTICIPANTS && selected.length < Object.keys(AgentPersona).length) {
    const missing = allPersonas.find((p) => !selected.includes(p.persona));
    if (missing) selected.push(missing.persona);
    else break;
  }

  // Trim to max
  const finalParticipants = selected.slice(0, MAX_PARTICIPANTS);

  const reason = additionalCandidates.length > 0
    ? `Base(${category}) + keyword-matched: ${additionalCandidates.map((c) => c.persona).join(', ')}`
    : `Base(${category})`;

  logger.info(
    { category, participants: finalParticipants, reason },
    'Participants selected for debate'
  );

  return {
    participants: finalParticipants,
    moderator: AgentPersona.PM,
    reason,
  };
}
