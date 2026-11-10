import {challengePromptCandidate} from './prompt-candidate.mjs';

// Separate experiment: historical prompt and requests remain byte-for-byte unchanged.
export const challengePromptEight=[
 challengePromptCandidate,
 'Every evidenceLines array, including a storage case trigger and each validation rule, must contain at most 8 distinct line numbers. For the valid storage case, cite no more than 8 representative lines that show the validation-to-load condition; link them to validation.rules.load. Do not list every field line in that trigger, invent citations, or omit a required rule merely to fit the limit. Check the count of each evidenceLines array before returning JSON.',
].join('\n');
