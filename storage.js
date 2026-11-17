const key = 'whippit:weeks:v1';
export function readWeeks() {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
export function writeWeeks(weeks) {
  try {
    localStorage.setItem(key,JSON.stringify(weeks));
    return true;
  } catch {
    return false;
  }
}
