/**
 * Persona Schema — Zod validation for YAML persona config files
 */

import { z } from 'zod';
import { AgentPersona, AITier } from '@rtb-ai-hub/shared';

const agentPersonaValues = Object.values(AgentPersona) as [string, ...string[]];
const aiTierValues = Object.values(AITier) as [string, ...string[]];

export const personaYamlSchema = z.object({
  persona: z.enum(agentPersonaValues),
  codename: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  traits: z.array(z.string()).min(1),
  vocabulary: z.array(z.string()).min(1),
  decisionFramework: z.string().min(1),
  domainExpertise: z.array(z.string()).min(1),
  handoffTriggers: z.record(z.string(), z.string()).default({}),
  aiTier: z.enum(aiTierValues),
  maxTokensPerTurn: z.coerce.number().int().min(1024).max(16384),
});

export type PersonaYaml = z.infer<typeof personaYamlSchema>;
