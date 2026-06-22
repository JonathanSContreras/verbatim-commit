/**
 * Minimal terminal spinner for "work in progress" feedback (e.g. while the
 * model generates). Writes to stderr and only animates when stderr is a TTY,
 * so it never pollutes piped stdout or non-interactive output.
 *
 * Returns a stop function that clears the spinner line and restores the cursor.
 */
const FRAMES = ["|", "/", "-", "\\"];

export function startSpinner(text: string): () => void {
  const stream = process.stderr;
  if (!stream.isTTY) return () => {};

  let i = 0;
  stream.write("\x1b[?25l"); // hide cursor
  const timer = setInterval(() => {
    stream.write(`\r${FRAMES[i = (i + 1) % FRAMES.length]} ${text}`);
  }, 80);

  return () => {
    clearInterval(timer);
    stream.write("\r\x1b[K\x1b[?25h"); // clear line, show cursor
  };
}
