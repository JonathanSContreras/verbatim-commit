/**
 * Clean up a model-generated commit message — pure, easy to test.
 *
 * The prompt tells the model to avoid code in the body, but smaller models
 * still occasionally echo a diff/code line. Belt-and-suspenders: strip markdown
 * fences, surrounding quotes, leftover diff markers, and body lines that look
 * like raw code. Conservative — a line is only dropped as "code" when it has
 * braces AND a code-ish operator, which prose effectively never does.
 */
function looksLikeCode(line: string): boolean {
  return /[{}]/.test(line) && /[;=]|=>|\(\)/.test(line);
}

export function cleanCommitMessage(raw: string): string {
  let text = raw.trim();

  // Strip a wrapping ```fence ... ``` if the model added one.
  text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();

  const lines = text.split("\n");
  const subject = (lines.shift() ?? "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  const body = lines.filter((line) => {
    const t = line.trim();
    if (t.startsWith("diff --git") || t.startsWith("@@") || t === "```") return false;
    if (looksLikeCode(t)) return false;
    return true;
  });

  const bodyText = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return (bodyText ? `${subject}\n\n${bodyText}` : subject).trim();
}
