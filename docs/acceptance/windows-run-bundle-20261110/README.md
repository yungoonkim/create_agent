# Windows 실행 ZIP 배포 검사

[배포 구성과 한계](../../windows-run-bundle-20261110.md), [다운로드](../../../downloads/README.md)를 참조한다. 실제 Gemini/OAuth 호출0회이며 Windows 자체 실행 확인과 Cloud Linux 검사를 구분한다.

- [검증/보호 기록](validation.json)
- [전체173개 검사 로그](full-test-output.txt)
- [실행용165개 검사 로그](runtime-test-output.txt)
- [택배 고정 응답 요약](runtime-dry-summary.json): 모의4회·실제0회.

배포 ZIP은 manifest의 소스 커밋에서 만든다. 최종 ZIP을 다시 독립 해제해 검사하고, 설치/빌드/165개 테스트를 수행한 패키지와 실행 파일의 바이트가 같은지 대조한다. README/manifest의 커밋 표기 차이는 구분한다. 기존 원자료와 승인을 교체하지 않는다.
