/**
 * Starts a request one tick after an effect runs, and returns the cleanup that cancels the start.
 *
 * React StrictMode (development only) runs every effect, then its cleanup, then the effect again.
 * Starting the request synchronously would send it, abort it a moment later and send it again:
 * a cancelled-then-repeated pair in the Network tab. Deferring the start means the throwaway first
 * run is cleaned up before anything is sent, so only the real one reaches the server.
 */
export function deferStart(start: () => void): () => void {
  const timer = setTimeout(start, 0);
  return () => clearTimeout(timer);
}
