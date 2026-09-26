export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Approved company information. The assistant may only state facts that exist here.
 * Shaped so it can later be loaded from a database without changing consumers.
 */
export type CompanyConfig = {
  id: string;
  /** Display/written name, e.g. in emails. */
  name: string;
  /** How the assistant says the name aloud. TTS mispronounces "&", so write it out. */
  spokenName: string;
  phone: string;
  address: string;

  /** "HH:MM-HH:MM", or null when closed. */
  openingHours: Readonly<Record<Weekday, string | null>>;

  services: readonly string[];

  /** Published prices in SEK. Anything not listed here is an unknown price. */
  approvedPrices: Readonly<Record<string, number>>;

  tireHotel: boolean;
  dropInPolicy: string;

  /** Workshop inbox for requests. Validated at use via `getServerEnv()`. */
  notificationEmail: string | undefined;
};
