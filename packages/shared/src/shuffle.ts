// 셔플 유틸. 서버에서만 사용한다(RNG 는 서버측). (rule.md §10)
// 엔진 자체는 셔플 결과(카드 배열)를 입력으로 받아 순수하게 유지된다.

/** Fisher–Yates 셔플. rng 미지정 시 Math.random 사용. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
