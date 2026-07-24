/** Bus léger : le client HTTP notifie succès/échec sans dépendre de React. */

type ApiResultListener = (ok: boolean) => void;

const listeners = new Set<ApiResultListener>();

export function reportApiResult(ok: boolean): void {
  for (const listener of listeners) {
    listener(ok);
  }
}

export function subscribeApiResult(listener: ApiResultListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
