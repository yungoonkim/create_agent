export interface SessionFailureMessage { readonly code: string; readonly message: string }
/** Local filesystem diagnostics only; never echo arbitrary SDK errors, headers, tokens or stacks. */
export function sessionFailureMessage(error: unknown): SessionFailureMessage {
  if (!(error instanceof Error)) return { code: "SESSION_STOPPED", message: "세션이 중단됐습니다. 저장된 상태와 요청 기록을 확인하세요. 자동 유료 재시도는 하지 않았습니다." };
  const local = error as NodeJS.ErrnoException;
  const path = typeof local.path === "string" ? local.path.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512) : "";
  if (["ENOENT", "ENOTDIR", "EEXIST", "EACCES", "EPERM"].includes(local.code ?? "") && typeof local.syscall === "string" && path) {
    if (local.code === "ENOENT" || local.code === "ENOTDIR") return { code: "LOCAL_PATH_MISSING",
      message: `필요한 파일 또는 폴더를 찾을 수 없습니다: ${path}. 기록 폴더와 실행 코드 폴더를 확인하세요.` };
    if (local.code === "EEXIST") return { code: "LOCAL_ALREADY_EXISTS", message: /(?:session|provider)\.lock$/.test(path)
      ? `실행 잠금이 있습니다: ${path}. 다른 실행이나 미완료 요청을 확인하세요. 잠금·요청 예약을 자동으로 삭제하지 않았습니다.`
      : `이미 존재하는 경로입니다: ${path}. 기존 세션을 덮어쓰지 않았습니다. import를 반복하지 말고 status로 확인하세요.` };
    return { code: "LOCAL_ACCESS_DENIED", message: `파일 또는 폴더 접근이 거부됐습니다: ${path}. 접근 권한을 확인하세요.` };
  }
  if (error.message.startsWith("REQUEST_BUDGET:")) return { code: "REQUEST_BUDGET", message: error.message };
  if (error.message === "Recovery artifact manifest mismatch.") return { code: "SOURCE_INTEGRITY", message: "복구 자료의 파일 목록 또는 해시가 원래 기록과 다릅니다. 원본 압축을 보관하고 변경된 자료를 확인하세요." };
  if (error.message === "Session source changed; create an approved Scope change instead.") return { code: "SESSION_INTEGRITY", message: "저장된 세션 입력이 최초 스냅샷과 다릅니다. Scope·모델·요구를 임의로 덮어쓰지 않았는지 확인하세요." };
  if (error.message === "Original request budget was modified.") return { code: "BUDGET_INTEGRITY", message: "원래 호출 예산 파일이 변경됐습니다. 기존 사용 횟수와 예산 이력을 보존하고 확인하세요." };
  const option = /^Missing --([a-z-]+)\.$/.exec(error.message);
  if (option) return { code: "MISSING_OPTION", message: `필수 옵션 --${option[1]}이 없습니다.` };
  return { code: "MODEL_OR_VALIDATION_STOP", message: "모델 또는 세션 검증에서 중단됐습니다. 저장된 상태·응답·검증 기록을 확인하세요. 자동 유료 재시도는 하지 않았습니다." };
}
