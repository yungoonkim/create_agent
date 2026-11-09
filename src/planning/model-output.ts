import type { ModelOutputFailure } from "./contracts.js";

export interface ModelOutput {
  readonly text?: string | undefined;
  readonly candidates?: readonly { readonly finishReason?: string }[];
}
export class ModelOutputError extends Error {
  constructor(readonly detail: ModelOutputFailure) {
    super(detail.code === "MODEL_OUTPUT_LIMIT"
      ? `MODEL_OUTPUT_LIMIT: ${detail.stage} 응답이 출력 토큰 한도에서 중단됐습니다. 부분 응답은 완성된 기획/검토로 사용하지 않습니다. ${detail.nextAction}`
      : `MODEL_OUTPUT_INCOMPLETE: ${detail.stage} 응답이 정상 완료되지 않았습니다. ${detail.nextAction}`);
    this.name = "ModelOutputError";
  }
}
/** Reject even syntactically valid partial output. Missing metadata remains supported for legacy clients/fixtures. */
export function assertCompleteOutput(response: ModelOutput, stage: ModelOutputFailure["stage"]): void {
  const finishReasons = response.candidates?.flatMap(c => c.finishReason === undefined ? [] : [c.finishReason]) ?? [];
  if (finishReasons.every(r => r === "STOP")) return;
  throw new ModelOutputError({ code: finishReasons.includes("MAX_TOKENS") ? "MODEL_OUTPUT_LIMIT" : "MODEL_OUTPUT_INCOMPLETE",
    stage, finishReasons, partialText: (response.text ?? "").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 131072),
    nextAction: stage === "writer"
      ? "report로 저장 상태와 오류를 확인하세요. 부분 초안을 완성본으로 저장하거나 자동 재호출하지 않습니다. 원요청·기존 승인/기획을 보존하고 후속 실행을 별도로 결정하세요."
      : "report 또는 review-plan으로 저장 초안과 오류를 확인하세요. 자동 재호출은 하지 않습니다. retry-review는 변경되지 않은 reviewing 상태·미사용 재시도·원래 예산 여유가 있을 때 별도 유료 확인과 이유 입력을 거쳐 한 번만 가능합니다." });
}
export function modelOutputFailure(error: unknown): ModelOutputFailure | undefined {
  let current = error;
  for (let i = 0; i < 5 && current instanceof Error; i++) {
    if (current instanceof ModelOutputError) return current.detail;
    current = current.cause;
  }
  return undefined;
}
