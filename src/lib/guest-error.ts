/** Something the guest can fix (bad address, missing field). Shown to them; not a site failure. */
export class GuestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestInputError";
  }
}

export function isGuestInputError(err: unknown): err is GuestInputError {
  return err instanceof Error && err.name === "GuestInputError";
}
