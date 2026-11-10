import {REVIEW_CHALLENGE_SYSTEM_INSTRUCTION} from '../../dist/src/planning/prompts.js';

// Separate experimental prompt: historical requests and ZIPs retain their exact bytes.
export const challengePromptCandidate=[
  REVIEW_CHALLENGE_SYSTEM_INSTRUCTION,
  'Return exactly one JSON object with top-level keys issues (array), questions (array), and storageAudit (object). Use questions, never userQuestions. No Markdown or explanatory text outside JSON. If there are no issues or questions use empty arrays; never omit a required key.',
  'storageAudit must include format, evidenceLines (array), rationale (nonempty string), cases (array), and validation (object with rationale and rules array). For JSON, cases must contain exactly one row for each state: absent, present_empty, invalid, valid, read_error. Every row must include state, action, verdict, evidenceLines, trigger: {evidenceLines}, authorizationScopeIds (array), and rationale. verdict is consistent, unsafe, or needs_user_input. Do not drop state or verdict even when the action is obvious.',
  'Each validation.rules row must include rule, status, load: {evidenceLines}, candidate: {evidenceLines}, acceptance: {evidenceLines}, and rationale. Before returning, check all required field names and types. When evidence is absent, use an empty evidenceLines array and an honest missing/unclear status or issue; never fabricate citations or conclusions to complete the shape.',
].join('\n');
